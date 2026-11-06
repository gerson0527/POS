use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
pub struct BackendState(pub Mutex<Option<Child>>);

// Node 22's JS realpath loader cannot resolve Windows verbatim paths, even
// though Rust and Windows accept them. Normalize cwd as well as the entrypoint.
fn node_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        let mut components = path.components();
        if let Some(Component::Prefix(prefix)) = components.next() {
            let mut normal = match prefix.kind() {
                Prefix::VerbatimDisk(drive) => PathBuf::from(format!("{}:\\", drive as char)),
                Prefix::VerbatimUNC(server, share) => {
                    let mut unc = PathBuf::from(r"\\");
                    unc.push(server);
                    unc.push(share);
                    unc
                }
                _ => return path.to_path_buf(),
            };
            for component in components {
                if component != Component::RootDir {
                    normal.push(component.as_os_str());
                }
            }
            return normal;
        }
    }
    path.to_path_buf()
}

fn node_command(directory: &Path, node: &Path, entry: &Path) -> Command {
    let mut command = Command::new(node_path(node));
    command
        .arg(node_path(entry))
        .current_dir(node_path(directory));
    command
}

fn backend_ready(address: SocketAddr) -> bool {
    let Ok(mut stream) =
        TcpStream::connect_timeout(&address, std::time::Duration::from_millis(250))
    else {
        return false;
    };
    if stream
        .set_read_timeout(Some(std::time::Duration::from_millis(500)))
        .is_err()
        || stream
            .write_all(
                b"GET /api/ready HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nConnection: close\r\n\r\n",
            )
            .is_err()
    {
        return false;
    }
    let mut response = [0; 64];
    matches!(
        stream.read(&mut response),
        Ok(length) if response[..length].starts_with(b"HTTP/1.1 200")
            || response[..length].starts_with(b"HTTP/1.0 200")
    )
}

fn wait_for_backend(child: &mut Child, log_path: &Path) -> Result<(), String> {
    let address = "127.0.0.1:3000".parse().unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!(
                "El servidor se cerró ({status}). Revisa el registro: {}",
                log_path.display()
            ));
        }
        if backend_ready(address) {
            return Ok(());
        }
        if std::time::Instant::now() >= deadline {
            return Err(format!(
                "El servidor no respondió a la comprobación de salud en 60 segundos. Revisa el registro: {}",
                log_path.display()
            ));
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
}

pub fn env_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory)
        .map_err(|e| format!("No se puede crear la carpeta de configuración: {e}"))?;
    Ok(directory.join(".env"))
}

pub fn read_env(app: &tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    let path = env_path(app)?;
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let text =
        fs::read_to_string(path).map_err(|e| format!("No se puede leer la configuración: {e}"))?;
    let mut values = BTreeMap::new();
    for line in text.lines() {
        if line.trim().starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let value = value.trim();
            let decoded = if value.starts_with('"') && value.ends_with('"') {
                // The setup API writes dotenv double-quoted values, not JSON escapes.
                value[1..value.len() - 1]
                    .replace("\\n", "\n")
                    .replace("\\r", "\r")
            } else if value.starts_with('\'') && value.ends_with('\'') {
                value[1..value.len() - 1].to_string()
            } else if value.starts_with('`') && value.ends_with('`') {
                value[1..value.len() - 1].to_string()
            } else {
                value.split('#').next().unwrap_or("").trim().to_string()
            };
            values.insert(key.trim().to_string(), decoded);
        }
    }
    Ok(values)
}

pub fn save_env(
    app: &tauri::AppHandle,
    database_url: Option<&str>,
    database_mode: Option<&str>,
    database_name: Option<&str>,
) -> Result<(), String> {
    let mut values = read_env(app)?;
    if let Some(url) = database_url {
        values.insert("DATABASE_URL".into(), url.into());
    }
    if let Some(mode) = database_mode {
        values.insert("POS_DATABASE_MODE".into(), mode.into());
    }
    if let Some(name) = database_name {
        values.insert("POS_DATABASE_NAME".into(), name.into());
    }
    values
        .entry("BETTER_AUTH_URL".into())
        .or_insert_with(|| "http://localhost:3000".into());
    values
        .entry("NEXT_PUBLIC_APP_URL".into())
        .or_insert_with(|| "http://localhost:3000".into());
    // SQLite's randomblob uses the OS-seeded PRNG already available in the desktop runtime.
    let random = rusqlite::Connection::open_in_memory().map_err(|e| e.to_string())?;
    for key in ["BETTER_AUTH_SECRET", "ENCRYPTION_KEY", "CRON_SECRET"] {
        if !values.contains_key(key) {
            let secret: String = random
                .query_row("SELECT lower(hex(randomblob(32)))", [], |row| row.get(0))
                .map_err(|e| format!("No se pudo generar {key}: {e}"))?;
            values.insert(key.into(), secret);
        }
    }
    let mut text = String::from("# Configuración POS Desktop\n");
    for (key, value) in values {
        // Backticks are supported by dotenv and preserve passwords containing quotes or #.
        if value.contains(['`', '\n', '\r']) {
            return Err(format!(
                "El valor de {key} contiene caracteres no admitidos en la configuración."
            ));
        }
        text.push_str(&format!("{key}=`{value}`\n"));
    }
    fs::write(env_path(app)?, text).map_err(|e| format!("No se pudo guardar la configuración: {e}"))
}

pub fn start(app: &tauri::AppHandle, restart: bool) -> Result<bool, String> {
    let state = app.state::<BackendState>();
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = process.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            if !restart {
                return Ok(true);
            }
            child
                .kill()
                .map_err(|e| format!("No se pudo reiniciar el servidor: {e}"))?;
            child.wait().map_err(|e| e.to_string())?;
        }
        *process = None;
    }
    let config = node_path(&env_path(app)?);
    if !config.exists() {
        return Ok(false);
    }
    let log_path = config.with_file_name("backend.log");
    let address = "127.0.0.1:3000".parse().unwrap();
    if std::net::TcpStream::connect_timeout(&address, std::time::Duration::from_millis(500)).is_ok()
    {
        return Err("El puerto 3000 está ocupado por otro proceso. Cierra el otro servidor o aplicación y reintenta.".into());
    }
    let resources = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("backend");
    let (directory, node, entry) = if cfg!(debug_assertions) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf();
        (
            root,
            PathBuf::from("node"),
            PathBuf::from("node_modules/next/dist/bin/next"),
        )
    } else {
        let node = resources.join("node.exe");
        let server = resources.join("server.js");
        if !node.is_file() || !server.is_file() {
            return Err("El instalador no contiene el servidor de producción o node.exe. Genera e instala una nueva versión del instalador.".into());
        }
        (resources, node, server)
    };
    let log = File::create(&log_path)
        .map_err(|e| format!("No se puede crear {}: {e}", log_path.display()))?;
    let stderr = log.try_clone().map_err(|e| e.to_string())?;
    let mut command = node_command(&directory, &node, &entry);
    {
        use std::io::Write;
        writeln!(&log, "[POS Desktop] Node: {}", node_path(&node).display())
            .map_err(|e| e.to_string())?;
        writeln!(
            &log,
            "[POS Desktop] Servidor: {}",
            node_path(&entry).display()
        )
        .map_err(|e| e.to_string())?;
        writeln!(
            &log,
            "[POS Desktop] Carpeta: {}",
            node_path(&directory).display()
        )
        .map_err(|e| e.to_string())?;
    }
    command
        .envs(read_env(app)?)
        .env("POS_DESKTOP_ENV_FILE", &config)
        .env("HOSTNAME", "127.0.0.1")
        .env("PORT", "3000")
        .env(
            "NODE_ENV",
            if cfg!(debug_assertions) {
                "development"
            } else {
                "production"
            },
        )
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(stderr));
    if cfg!(debug_assertions) {
        command.args(["dev", "--hostname", "127.0.0.1", "--port", "3000"]);
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    *process = Some(command.spawn().map_err(|e| {
        format!(
            "No se pudo iniciar el servidor: {e}. Registro: {}",
            log_path.display()
        )
    })?);
    if let Err(error) = wait_for_backend(process.as_mut().unwrap(), &log_path) {
        if let Some(mut child) = process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        return Err(error);
    }
    Ok(true)
}

#[tauri::command]
pub fn check_backend_server(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<BackendState>();
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = process.as_mut() {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            let log = env_path(&app)?.with_file_name("backend.log");
            return Err(format!(
                "El servidor se cerró ({status}). Revisa el registro: {}",
                log.display()
            ));
        }
        return Ok(());
    }
    Err("El servidor no está iniciado. Reintenta la instalación.".into())
}

pub fn stop(app: &tauri::AppHandle) {
    let state = app.state::<BackendState>();
    if let Ok(mut process) = state.0.lock() {
        if let Some(mut child) = process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    };
}

pub fn url_component(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn encode_database_credentials() {
        assert_eq!(super::url_component("p@ss:# /?"), "p%40ss%3A%23%20%2F%3F");
        assert_eq!(super::url_component("postgres"), "postgres");
    }

    #[cfg(windows)]
    #[test]
    fn normalize_node_windows_paths() {
        use super::node_path;
        use std::path::Path;
        for (input, expected) in [
            (
                r"\\?\C:\Program Files\POS Retail\backend",
                r"C:\Program Files\POS Retail\backend",
            ),
            (r"\\?\D:\Comercio ñ\server.js", r"D:\Comercio ñ\server.js"),
            (
                r"\\?\UNC\servidor\ventas\POS Retail\server.js",
                r"\\servidor\ventas\POS Retail\server.js",
            ),
            (r"C:\POS Retail\server.js", r"C:\POS Retail\server.js"),
            (
                r"\\servidor\ventas\server.js",
                r"\\servidor\ventas\server.js",
            ),
            ("server.js", "server.js"),
        ] {
            assert_eq!(node_path(Path::new(input)), Path::new(expected));
        }
    }

    #[cfg(windows)]
    #[test]
    fn bundled_node_starts_from_verbatim_paths() {
        use super::node_command;
        use std::path::PathBuf;
        use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
        let node = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("backend/node.exe");
        assert!(
            node.is_file(),
            "Prepara el backend con npm run build antes de esta prueba."
        );
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("POS rutas ñ {} {unique}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let entry = directory.join("server.cjs");
        std::fs::write(&entry, "if (process.cwd().startsWith('\\\\\\\\?')) process.exit(2); console.log('POS_NODE_PATH_OK')").unwrap();
        // canonicalize deliberately recreates the paths returned by Tauri on Windows.
        let directory_verbatim = directory.canonicalize().unwrap();
        let entry_verbatim = entry.canonicalize().unwrap();
        let node_verbatim = node.canonicalize().unwrap();
        for script in [&entry_verbatim, &PathBuf::from("server.cjs")] {
            let mut command = node_command(&directory_verbatim, &node_verbatim, script);
            command
                .env_remove("NODE_OPTIONS")
                .env_remove("NODE_PATH")
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            let mut child = command.spawn().unwrap();
            let deadline = Instant::now() + Duration::from_secs(10);
            while child.try_wait().unwrap().is_none() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(25));
            }
            let timed_out = child.try_wait().unwrap().is_none();
            if timed_out {
                let _ = child.kill();
            }
            let output = child.wait_with_output().unwrap();
            if timed_out || !output.status.success() {
                let _ = std::fs::remove_dir_all(&directory);
                panic!(
                    "Node no inició: timeout={timed_out}, estado={}, stderr={}",
                    output.status,
                    String::from_utf8_lossy(&output.stderr)
                );
            }
            assert!(String::from_utf8_lossy(&output.stdout).contains("POS_NODE_PATH_OK"));
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
}
