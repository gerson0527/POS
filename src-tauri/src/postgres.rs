//! Private, per-user PostgreSQL 17. Never discovers or controls system installations.
//! The parent registers `PostgresState` and calls `stop` on its exit/power lifecycle.
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

const MAJOR: u32 = 17;
const DEFAULT_PORT: u16 = 55432;
const DATABASE: &str = "pos_retail_enterprise";
const ADMIN: &str = "pos_retail_admin";
const USER: &str = "pos_retail_app";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Default)]
pub struct PostgresState(Mutex<Option<Running>>);

pub struct ManagedConnection {
    pub database_url: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Credentials {
    schema_version: u32,
    postgres_major: u32,
    port: u16,
    user: String,
    password: String,
    admin: String,
    admin_password: String,
    database_name: String,
}

impl Credentials {
    fn validate(&self) -> Result<(), String> {
        let secret = |s: &str| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit());
        if self.schema_version != 1 || self.postgres_major != MAJOR {
            return Err(
                "Metadatos PostgreSQL incompatibles; no se realizará una migración automática"
                    .into(),
            );
        }
        if self.port < 1024
            || self.user != USER
            || self.admin != ADMIN
            || self.database_name != DATABASE
            || !secret(&self.password)
            || !secret(&self.admin_password)
            || self.password == self.admin_password
        {
            return Err(
                "credentials.json inválido; no se reemplazarán las credenciales existentes".into(),
            );
        }
        Ok(())
    }

    fn connection(&self) -> ManagedConnection {
        ManagedConnection {
            database_url: format!(
                "postgresql://{}:{}@127.0.0.1:{}/{}",
                crate::backend::url_component(&self.user),
                crate::backend::url_component(&self.password),
                self.port,
                crate::backend::url_component(&self.database_name)
            ),
        }
    }

    fn secrets(&self) -> [&str; 2] {
        [&self.password, &self.admin_password]
    }
}

struct Paths {
    root: PathBuf,
    data: PathBuf,
    logs: PathBuf,
    credentials: PathBuf,
}

impl Paths {
    fn new(local: &Path) -> Self {
        let root = local.join("postgres");
        Self {
            data: root.join("data"),
            logs: root.join("logs"),
            credentials: root.join("credentials.json"),
            root,
        }
    }
}

struct Bundle {
    root: PathBuf,
}
impl Bundle {
    fn validate(root: PathBuf) -> Result<Self, String> {
        for name in [
            "initdb.exe",
            "pg_ctl.exe",
            "psql.exe",
            "pg_isready.exe",
            "postgres.exe",
            "vcruntime140.dll",
            "vcruntime140_1.dll",
            "msvcp140.dll",
        ] {
            if !root.join("bin").join(name).is_file() {
                return Err(format!(
                    "Distribución PostgreSQL incompleta: falta bin/{name}"
                ));
            }
        }
        for name in ["lib", "share"] {
            if !root.join(name).is_dir() {
                return Err(format!("Distribución PostgreSQL incompleta: falta {name}"));
            }
        }
        Ok(Self { root })
    }
    fn command(&self, executable: &str) -> Command {
        let mut cmd = command(&self.root.join("bin").join(executable));
        cmd.current_dir(native_path(&self.root));
        cmd
    }
}

struct Running {
    paths: Paths,
    bundle: Bundle,
    credentials: Credentials,
    child: Option<Child>,
    identity: Option<Identity>,
}

#[derive(Clone, PartialEq, Eq, Debug)]
struct Identity {
    pid: u32,
    started: u64,
    port: u16,
}

// PostgreSQL utilities do not consistently accept Windows verbatim paths.
fn native_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        let mut components = path.components();
        if let Some(Component::Prefix(prefix)) = components.next() {
            let mut result = match prefix.kind() {
                Prefix::VerbatimDisk(drive) => PathBuf::from(format!("{}:\\", drive as char)),
                Prefix::VerbatimUNC(server, share) => {
                    let mut p = PathBuf::from(r"\\");
                    p.push(server);
                    p.push(share);
                    p
                }
                _ => return path.to_path_buf(),
            };
            for component in components {
                if component != Component::RootDir {
                    result.push(component.as_os_str());
                }
            }
            return result;
        }
    }
    path.to_path_buf()
}

fn same_directory(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(a), Ok(b)) => {
            #[cfg(windows)]
            {
                native_path(&a)
                    .to_string_lossy()
                    .eq_ignore_ascii_case(&native_path(&b).to_string_lossy())
            }
            #[cfg(not(windows))]
            {
                a == b
            }
        }
        _ => false,
    }
}

fn command(program: &Path) -> Command {
    let mut cmd = Command::new(native_path(program));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW, also in debug builds.
    }
    // Inherited libpq service/host/options variables must never redirect a connection.
    for (key, _) in std::env::vars_os() {
        if key.to_string_lossy().to_ascii_uppercase().starts_with("PG") {
            cmd.env_remove(key);
        }
    }
    cmd.env_remove("POS_PG_APP_PASSWORD");
    cmd.stdin(Stdio::null());
    cmd
}

fn random_secret() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes)
        .map_err(|_| "No se pudo obtener aleatoriedad del sistema operativo".to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

struct Temporary {
    path: PathBuf,
}
impl Temporary {
    fn create(root: &Path, label: &str, contents: &[u8]) -> Result<Self, String> {
        let path = root.join(format!(".{label}-{}.tmp", random_secret()?));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&path)
            .map_err(|e| format!("No se pudo crear archivo privado: {e}"))?;
        let temporary = Self { path };
        file.write_all(contents)
            .and_then(|_| file.sync_all())
            .map_err(|e| format!("No se pudo escribir archivo privado: {e}"))?;
        Ok(temporary)
    }
}
impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

struct Output {
    status: ExitStatus,
    stdout: String,
}

fn read_limited(path: &Path) -> Result<String, String> {
    let mut bytes = Vec::new();
    File::open(path)
        .and_then(|f| f.take(65536).read_to_end(&mut bytes))
        .map_err(|e| format!("No se pudo leer salida del proceso: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn redact(mut text: String, secrets: &[&str]) -> String {
    for secret in secrets {
        if !secret.is_empty() {
            text = text.replace(secret, "[REDACTED]");
        }
    }
    text
}

// Polling plus regular files avoids both pipe-buffer deadlocks and unbounded waits.
fn run(
    cmd: &mut Command,
    paths: &Paths,
    label: &str,
    timeout: Duration,
    secrets: &[&str],
) -> Result<Output, String> {
    let stdout = Temporary::create(&paths.logs, "stdout", b"")?;
    let stderr = Temporary::create(&paths.logs, "stderr", b"")?;
    cmd.stdout(File::create(&stdout.path).map_err(|e| e.to_string())?)
        .stderr(File::create(&stderr.path).map_err(|e| e.to_string())?);
    let mut child = cmd.spawn().map_err(|e| {
        format!("No se pudo ejecutar {label}: {e}. Compruebe las DLL/runtime de la distribución")
    })?;
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(40)),
            result => {
                let _ = child.kill();
                let kill_deadline = Instant::now() + Duration::from_secs(2);
                while Instant::now() < kill_deadline {
                    if matches!(child.try_wait(), Ok(Some(_))) {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(20));
                }
                return Err(match result {
                    Err(e) => format!("Error esperando {label}: {e}"),
                    _ => format!("Tiempo agotado ejecutando {label}"),
                });
            }
        }
    };
    let out = redact(read_limited(&stdout.path)?, secrets);
    let err = redact(read_limited(&stderr.path)?, secrets);
    fs::write(
        paths.logs.join(format!("{label}.log")),
        format!("{status}\n{out}\n{err}"),
    )
    .map_err(|e| format!("No se pudo guardar log de {label}: {e}"))?;
    Ok(Output {
        status,
        stdout: out,
    })
}

fn checked(
    cmd: &mut Command,
    paths: &Paths,
    label: &str,
    timeout: Duration,
    secrets: &[&str],
) -> Result<Output, String> {
    let result = run(cmd, paths, label, timeout, secrets)?;
    if !result.status.success() {
        return Err(format!(
            "{label} falló ({}); consulte {}",
            result.status,
            paths.logs.join(format!("{label}.log")).display()
        ));
    }
    Ok(result)
}

fn reject_link(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|e| format!("No se pudo inspeccionar {}: {e}", path.display()))?;
    #[cfg(windows)]
    let linked = {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    };
    #[cfg(not(windows))]
    let linked = metadata.file_type().is_symlink();
    if linked {
        return Err(format!(
            "No se permiten enlaces/reparse points en {}",
            path.display()
        ));
    }
    Ok(())
}

fn reject_tree_links(root: &Path) -> Result<(), String> {
    reject_link(root)?;
    if root.is_dir() {
        for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
            reject_tree_links(&entry.map_err(|e| e.to_string())?.path())?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn current_sid(text: &str) -> Result<String, String> {
    text.split([',', '"', '\r', '\n'])
        .map(str::trim)
        .find(|s| {
            s.starts_with("S-1-")
                && s[4..]
                    .split('-')
                    .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
        })
        .map(str::to_owned)
        .ok_or_else(|| "whoami no devolvió un SID válido".into())
}

#[cfg(windows)]
fn acl_principals(descriptor: &str) -> Result<Vec<String>, String> {
    if !descriptor.starts_with("D:P") {
        return Err("La DACL privada debe estar protegida".into());
    }
    let mut principals = Vec::new();
    for ace in descriptor.split('(').skip(1) {
        let fields: Vec<_> = ace.split(')').next().unwrap_or("").split(';').collect();
        if fields.len() != 6 || !matches!(fields[0], "A" | "D") {
            return Err("ACL no compatible; se requiere revisión manual".into());
        }
        let principal = match fields[5] {
            "SY" => "S-1-5-18",
            "BA" => "S-1-5-32-544",
            "BU" => "S-1-5-32-545",
            "WD" => "S-1-1-0",
            "AU" => "S-1-5-11",
            "CO" => "S-1-3-0",
            "CG" => "S-1-3-1",
            "OW" => "S-1-3-4",
            "IU" => "S-1-5-4",
            "SU" => "S-1-5-6",
            "LS" => "S-1-5-19",
            "NS" => "S-1-5-20",
            value if current_sid(value).as_deref() == Ok(value) => value,
            _ => {
                return Err(
                    "Principal ACL desconocido; no se continuará con permisos inseguros".into(),
                )
            }
        };
        principals.push(principal.to_owned());
    }
    if principals.is_empty() {
        return Err("La DACL privada no tiene permisos explícitos".into());
    }
    Ok(principals)
}

fn secure_root(paths: &Paths) -> Result<(), String> {
    reject_tree_links(&paths.root)?;
    #[cfg(windows)]
    {
        let system = PathBuf::from(std::env::var_os("SystemRoot").ok_or("Falta SystemRoot")?)
            .join("System32");
        let result = checked(
            command(&system.join("whoami.exe")).args(["/user", "/fo", "csv", "/nh"]),
            paths,
            "whoami",
            COMMAND_TIMEOUT,
            &[],
        )?;
        let sid = current_sid(&result.stdout)?;
        let acl = system.join("icacls.exe");
        // Never /reset the root: that would briefly expose existing secrets to parent ACLs.
        checked(
            command(&acl)
                .arg(native_path(&paths.root))
                .args(["/remove:d", &format!("*{sid}")]),
            paths,
            "acl-deny",
            COMMAND_TIMEOUT,
            &[],
        )?;
        checked(
            command(&acl).arg(native_path(&paths.root)).args([
                "/grant:r",
                &format!("*{sid}:(OI)(CI)F"),
                "/inheritance:r",
            ]),
            paths,
            "acl-private",
            COMMAND_TIMEOUT,
            &[],
        )?;
        let saved = Temporary::create(&paths.root, "acl", b"")?;
        checked(
            command(&acl)
                .arg(native_path(&paths.root))
                .arg("/save")
                .arg(native_path(&saved.path)),
            paths,
            "acl-save",
            COMMAND_TIMEOUT,
            &[],
        )?;
        let bytes = fs::read(&saved.path).map_err(|e| e.to_string())?;
        if bytes.len() % 2 != 0 {
            return Err("ACL guardada inválida".into());
        }
        let words: Vec<_> = bytes
            .chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .collect();
        let descriptor = String::from_utf16(&words).map_err(|_| "ACL no es UTF-16 válido")?;
        let descriptor = descriptor.lines().nth(1).ok_or("Falta DACL guardada")?;
        for principal in acl_principals(descriptor)? {
            if principal != sid {
                checked(
                    command(&acl)
                        .arg(native_path(&paths.root))
                        .args(["/remove", &format!("*{principal}")]),
                    paths,
                    "acl-remove",
                    COMMAND_TIMEOUT,
                    &[],
                )?;
            }
        }
        drop(saved);
        for entry in fs::read_dir(&paths.root).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            checked(
                command(&acl)
                    .arg(native_path(&path))
                    .args(["/reset", "/T", "/L", "/Q"]),
                paths,
                "acl-children",
                Duration::from_secs(60),
                &[],
            )?;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&paths.root, fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Share mode zero is an OS-released inter-process lock, not a stale PID/lock sentinel.
fn instance_lock(paths: &Paths) -> Result<File, String> {
    let path = paths.root.join("instance.lock");
    if path.exists() {
        reject_link(&path)?;
    }
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    let file = options.open(path).map_err(|e| {
        format!("Otra operación PostgreSQL está activa o no se pudo bloquear el directorio: {e}")
    })?;
    #[cfg(not(windows))]
    file.try_lock()
        .map_err(|e| format!("No se pudo bloquear PostgreSQL: {e}"))?;
    Ok(file)
}

fn choose_port(preferred: u16) -> Result<u16, String> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, preferred))
        .or_else(|_| TcpListener::bind((Ipv4Addr::LOCALHOST, 0)))
        .map_err(|e| format!("No hay un puerto privado disponible: {e}"))?;
    Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
}

fn validate_version(data: &Path) -> Result<bool, String> {
    let version = data.join("PG_VERSION");
    if !version.exists() {
        if data.exists()
            && fs::read_dir(data)
                .map_err(|e| e.to_string())?
                .next()
                .is_some()
        {
            return Err("El directorio data no está vacío pero no tiene PG_VERSION; se preservará para recuperación manual".into());
        }
        return Ok(false);
    }
    if fs::read_to_string(version)
        .map_err(|e| e.to_string())?
        .trim()
        != MAJOR.to_string()
    {
        return Err(
            "El clúster no es PostgreSQL 17; se preservará sin migración automática".into(),
        );
    }
    Ok(true)
}

fn credentials(paths: &Paths, initialized: bool) -> Result<Credentials, String> {
    if paths.credentials.exists() {
        let text = fs::read(&paths.credentials)
            .map_err(|e| format!("No se pudieron leer credenciales: {e}"))?;
        let result: Credentials = serde_json::from_slice(&text)
            .map_err(|_| "credentials.json inválido; no se regenerará".to_string())?;
        result.validate()?;
        return Ok(result);
    }
    if initialized {
        return Err(
            "Faltan credenciales de un clúster existente; no se cambiará su contraseña".into(),
        );
    }
    let result = Credentials {
        schema_version: 1,
        postgres_major: MAJOR,
        port: choose_port(DEFAULT_PORT)?,
        user: USER.into(),
        password: random_secret()?,
        admin: ADMIN.into(),
        admin_password: random_secret()?,
        database_name: DATABASE.into(),
    };
    result.validate()?;
    let temporary = Temporary::create(
        &paths.root,
        "credentials",
        &serde_json::to_vec_pretty(&result).map_err(|e| e.to_string())?,
    )?;
    fs::rename(&temporary.path, &paths.credentials)
        .map_err(|e| format!("No se pudieron persistir credenciales: {e}"))?;
    Ok(result)
}

fn initialize(running: &Running) -> Result<(), String> {
    let paths = &running.paths;
    let credentials = &running.credentials;
    let password = Temporary::create(
        &paths.root,
        "initdb-password",
        format!("{}\n", credentials.admin_password).as_bytes(),
    )?;
    // A failed/interrupted initdb never replaces data. Its staging directory is preserved.
    let staging = paths
        .root
        .join(format!("data.initializing-{}", random_secret()?));
    checked(
        running
            .bundle
            .command("initdb.exe")
            .arg("--pgdata")
            .arg(native_path(&staging))
            .arg("--username")
            .arg(ADMIN)
            .arg("--pwfile")
            .arg(native_path(&password.path))
            .args([
                "--auth-host=scram-sha-256",
                "--auth-local=scram-sha-256",
                "--encoding=UTF8",
                "--locale=C",
                "--no-instructions",
            ]),
        paths,
        "initdb",
        Duration::from_secs(120),
        &credentials.secrets(),
    )?;
    if paths.data.exists() {
        fs::remove_dir(&paths.data).map_err(|e| format!("No se reemplazará data: {e}"))?;
    }
    fs::rename(staging, &paths.data)
        .map_err(|e| format!("No se pudo publicar el clúster inicializado: {e}"))?;
    Ok(())
}

fn read_identity(paths: &Paths) -> Result<Identity, String> {
    let text = fs::read_to_string(paths.data.join("postmaster.pid"))
        .map_err(|e| format!("No se pudo leer postmaster.pid: {e}"))?;
    let lines: Vec<_> = text.lines().collect();
    if lines.len() < 4 || !same_directory(Path::new(lines[1]), &paths.data) {
        return Err("postmaster.pid no pertenece al directorio privado".into());
    }
    let identity = Identity {
        pid: lines[0].parse().map_err(|_| "PID inválido")?,
        started: lines[2].parse().map_err(|_| "Inicio inválido")?,
        port: lines[3].parse().map_err(|_| "Puerto inválido")?,
    };
    if identity.pid == 0 || identity.started == 0 || identity.port < 1024 {
        return Err("Identidad postmaster inválida".into());
    }
    Ok(identity)
}

fn status(running: &Running) -> Result<bool, String> {
    let result = run(
        running
            .bundle
            .command("pg_ctl.exe")
            .arg("status")
            .arg("-D")
            .arg(native_path(&running.paths.data)),
        &running.paths,
        "status",
        COMMAND_TIMEOUT,
        &running.credentials.secrets(),
    )?;
    match result.status.code() {
        Some(0) => Ok(true),
        Some(3) => Ok(false),
        _ => Err("No se pudo comprobar pg_ctl status; no se tocará ningún proceso".into()),
    }
}

fn psql(running: &Running, database: &str, admin: bool) -> Command {
    let mut cmd = running.bundle.command("psql.exe");
    cmd.args([
        "--no-psqlrc",
        "--no-password",
        "--quiet",
        "--tuples-only",
        "--no-align",
        "--field-separator=\t",
        "--set=ON_ERROR_STOP=1",
        "--set=VERBOSITY=terse",
        "--host=127.0.0.1",
        "--port",
    ])
    .arg(running.credentials.port.to_string())
    .arg("--username")
    .arg(if admin { ADMIN } else { USER })
    .arg("--dbname")
    .arg(database)
    .env(
        "PGPASSWORD",
        if admin {
            &running.credentials.admin_password
        } else {
            &running.credentials.password
        },
    )
    .env("PGCONNECT_TIMEOUT", "3")
    .env("PGSSLMODE", "disable")
    .env("PGGSSENCMODE", "disable")
    .env("PGHOSTADDR", "127.0.0.1")
    .env(
        "PGOPTIONS",
        "-c statement_timeout=5000 -c lock_timeout=3000",
    );
    cmd
}

fn authenticated_identity(running: &Running) -> Result<Identity, String> {
    let before = read_identity(&running.paths)?;
    if before.port != running.credentials.port {
        return Err("El puerto del clúster no coincide con sus metadatos".into());
    }
    let output = checked(psql(running, "postgres", true).arg("--command").arg("SELECT current_setting('data_directory'), current_setting('server_version_num')::int / 10000, inet_server_port(), floor(extract(epoch FROM pg_postmaster_start_time()))::bigint, current_user"), &running.paths, "identity", COMMAND_TIMEOUT, &running.credentials.secrets())?;
    let fields: Vec<_> = output.stdout.trim().split('\t').collect();
    if fields.len() != 5
        || !same_directory(Path::new(fields[0]), &running.paths.data)
        || fields[1] != "17"
        || fields[2] != before.port.to_string()
        || fields[3] != before.started.to_string()
        || fields[4] != ADMIN
        || read_identity(&running.paths)? != before
    {
        return Err("La conexión no corresponde al postmaster privado esperado; no se adjuntará ni detendrá".into());
    }
    if let Some(child) = &running.child {
        if child.id() != before.pid {
            return Err("El PID no corresponde al proceso PostgreSQL creado".into());
        }
    }
    Ok(before)
}

fn start(running: &mut Running) -> Result<(), String> {
    // Checking bind is non-destructive; a subsequent race is handled by PostgreSQL startup failure.
    let reservation = TcpListener::bind((Ipv4Addr::LOCALHOST, running.credentials.port))
        .map_err(|_| format!("El puerto persistido {} está ocupado; no se conectará a otra base ni cambiará el puerto", running.credentials.port))?;
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(running.paths.logs.join("postgres.log"))
        .map_err(|e| e.to_string())?;
    let stderr = log.try_clone().map_err(|e| e.to_string())?;
    let mut cmd = running.bundle.command("postgres.exe");
    cmd.arg("-D")
        .arg(native_path(&running.paths.data))
        .arg("-p")
        .arg(running.credentials.port.to_string())
        .args([
            "-c",
            "listen_addresses=127.0.0.1",
            "-c",
            "unix_socket_directories=",
            "-c",
            "password_encryption=scram-sha-256",
            "-c",
            "logging_collector=off",
            "-c",
            "log_statement=none",
            "-c",
            "log_min_error_statement=panic",
            "-c",
            "log_error_verbosity=terse",
        ])
        .stdout(log)
        .stderr(stderr);
    drop(reservation);
    running.child = Some(cmd.spawn().map_err(|e| {
        format!("No se pudo iniciar postgres.exe: {e}; compruebe el runtime de Visual C++")
    })?);
    let deadline = Instant::now() + Duration::from_secs(45);
    loop {
        if let Some(child) = running.child.as_mut() {
            if let Some(code) = child.try_wait().map_err(|e| e.to_string())? {
                return Err(format!(
                    "PostgreSQL terminó ({code}); consulte logs/postgres.log"
                ));
            }
        }
        if let Ok(identity) = authenticated_identity(running) {
            running.identity = Some(identity);
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(
                "PostgreSQL no completó su inicio autenticado; consulte logs/postgres.log".into(),
            );
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn sql_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn bootstrap(running: &Running) -> Result<(), String> {
    // Read the password on the server from a private short-lived file. Neither SQL
    // text, arguments, nor psql's error echo can contain the expanded CREATE ROLE.
    // Terse server/client errors suppress dynamic-SQL CONTEXT containing secrets.
    let password = Temporary::create(
        &running.paths.root,
        "role-password",
        running.credentials.password.as_bytes(),
    )?;
    let path = native_path(&password.path)
        .to_str()
        .ok_or("Ruta de contraseña no es Unicode")?
        .to_owned();
    let sql = format!("DO $pos$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pos_retail_app') THEN EXECUTE format('CREATE ROLE pos_retail_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', pg_read_file({})); END IF; END $pos$", sql_literal(&path));
    checked(
        psql(running, "postgres", true).arg("--command").arg(sql),
        &running.paths,
        "role",
        COMMAND_TIMEOUT,
        &running.credentials.secrets(),
    )?;
    drop(password);
    let script = Temporary::create(&running.paths.root, "bootstrap", br#"SELECT 'CREATE DATABASE pos_retail_enterprise OWNER pos_retail_app' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pos_retail_enterprise') \gexec
"#)?;
    checked(
        psql(running, "postgres", true)
            .arg("--file")
            .arg(native_path(&script.path)),
        &running.paths,
        "bootstrap",
        COMMAND_TIMEOUT,
        &running.credentials.secrets(),
    )?;
    let result = checked(psql(running, DATABASE, false).arg("--command").arg("SELECT current_database(), current_user, (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname = current_user), pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = current_database()))"), &running.paths, "app-ready", COMMAND_TIMEOUT, &running.credentials.secrets())?;
    if result.stdout.trim() != format!("{DATABASE}\t{USER}\tf\t{USER}") {
        return Err(
            "La base/rol de aplicación existente no cumple el contrato privado; no se modificará"
                .into(),
        );
    }
    Ok(())
}

fn stop_running(running: &mut Running) -> Result<(), String> {
    if let Some(child) = running.child.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            running.child = None;
        }
    }
    if !status(running)? {
        return Ok(());
    }
    // An OS child handle plus its own -D/PID file also permits stopping during
    // startup, before authentication is available. Adopted processes require SQL identity.
    let identity = if let Some(child) = running.child.as_ref() {
        let identity = read_identity(&running.paths)?;
        if identity.pid != child.id() || identity.port != running.credentials.port {
            return Err("El PID no pertenece al hijo PostgreSQL propio".into());
        }
        identity
    } else {
        authenticated_identity(running)?
    };
    if running
        .identity
        .as_ref()
        .is_some_and(|expected| *expected != identity)
    {
        return Err("El postmaster cambió; no se detendrá un proceso ajeno".into());
    }
    if running.identity.is_none() && running.child.is_none() {
        return Err("No existe una identidad propia para detener".into());
    }
    checked(
        running
            .bundle
            .command("pg_ctl.exe")
            .args(["stop", "-w", "-t", "10", "-m", "fast", "-D"])
            .arg(native_path(&running.paths.data)),
        &running.paths,
        "stop",
        COMMAND_TIMEOUT,
        &running.credentials.secrets(),
    )?;
    if let Some(child) = running.child.as_mut() {
        let _ = child.try_wait();
    }
    Ok(())
}

pub fn ensure_running(app: &tauri::AppHandle) -> Result<ManagedConnection, String> {
    if !cfg!(windows) {
        return Err("La distribución PostgreSQL privada requiere Windows".into());
    }
    let state = app.state::<PostgresState>();
    let mut state = state
        .0
        .lock()
        .map_err(|_| "Estado PostgreSQL bloqueado por un fallo previo")?;
    if let Some(running) = state.as_mut() {
        let _lock = instance_lock(&running.paths)?;
        if let Some(child) = running.child.as_mut() {
            if child.try_wait().map_err(|e| e.to_string())?.is_some() {
                running.child = None;
            }
        }
        if status(running)? {
            let identity = authenticated_identity(running)?;
            if running
                .identity
                .as_ref()
                .is_some_and(|old| *old != identity)
            {
                return Err("Cambió la identidad del postmaster privado".into());
            }
            running.identity = Some(identity);
            bootstrap(running)?;
            return Ok(running.credentials.connection());
        }
        running.identity = None;
        start(running)?;
        bootstrap(running)?;
        return Ok(running.credentials.connection());
    }
    let paths = Paths::new(&app.path().app_local_data_dir().map_err(|e| e.to_string())?);
    fs::create_dir_all(&paths.root).map_err(|e| e.to_string())?;
    reject_link(&paths.root)?;
    if paths.logs.exists() {
        reject_link(&paths.logs)?;
    }
    fs::create_dir_all(&paths.logs).map_err(|e| e.to_string())?;
    let _lock = instance_lock(&paths)?;
    secure_root(&paths)?;
    // A hard crash cannot run Drop; remove only our stale secret temporary files.
    for entry in fs::read_dir(&paths.root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if (name.starts_with(".initdb-password-") || name.starts_with(".role-password-"))
            && name.ends_with(".tmp")
        {
            fs::remove_file(entry.path())
                .map_err(|e| format!("No se pudo eliminar contraseña temporal: {e}"))?;
        }
    }
    let initialized = validate_version(&paths.data)?;
    let credentials = credentials(&paths, initialized)?;
    let resource = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("postgres");
    #[cfg(debug_assertions)]
    let resource = if resource.is_dir() {
        resource
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("postgres-bundle")
    };
    let bundle = Bundle::validate(resource)?;
    let version = checked(
        bundle.command("postgres.exe").arg("--version"),
        &paths,
        "version",
        COMMAND_TIMEOUT,
        &credentials.secrets(),
    )?;
    if !version
        .stdout
        .trim()
        .starts_with("postgres (PostgreSQL) 17.")
    {
        return Err("Los binarios incluidos no son PostgreSQL 17".into());
    }
    let running = Running {
        paths,
        bundle,
        credentials,
        child: None,
        identity: None,
    };
    if !initialized {
        initialize(&running)?;
    }
    *state = Some(running); // Retain ownership even if readiness/bootstrap fails.
    let running = state.as_mut().ok_or("Estado PostgreSQL ausente")?;
    if status(running)? {
        running.identity = Some(authenticated_identity(running)?);
    } else {
        start(running)?;
    }
    bootstrap(running)?;
    Ok(running.credentials.connection())
}

pub fn stop(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<PostgresState>() else {
        return;
    };
    let Ok(mut guard) = state.0.lock() else {
        log::error!("No se pudo bloquear el estado PostgreSQL para detenerlo");
        return;
    };
    let Some(running) = guard.as_mut() else {
        return;
    };
    let result = instance_lock(&running.paths).and_then(|_lock| stop_running(running));
    match result {
        Ok(()) => {
            *guard = None;
        }
        Err(error) => log::error!("No se detuvo PostgreSQL privado: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir()
                .join(format!("pos-postgres-test-{}", random_secret().unwrap()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn paths(&self) -> Paths {
            let paths = Paths::new(&self.0);
            fs::create_dir_all(&paths.logs).unwrap();
            paths
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn paths_are_per_user_and_portable() {
        let paths = Paths::new(Path::new("user with spaces"));
        assert_eq!(
            paths.data,
            Path::new("user with spaces").join("postgres/data")
        );
        assert_eq!(paths.credentials, paths.root.join("credentials.json"));
        assert_eq!(paths.logs, paths.root.join("logs"));
    }
    #[test]
    fn occupied_port_is_not_touched() {
        let occupied = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = occupied.local_addr().unwrap().port();
        assert_ne!(choose_port(port).unwrap(), port);
        assert_eq!(occupied.local_addr().unwrap().port(), port);
        assert!(TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_err());
    }
    #[test]
    fn free_port_is_preferred() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert_eq!(choose_port(port).unwrap(), port);
    }
    #[test]
    fn metadata_persists_and_does_not_rotate_passwords() {
        let directory = TestDirectory::new();
        let paths = directory.paths();
        let first = credentials(&paths, false).unwrap();
        let second = credentials(&paths, true).unwrap();
        assert_eq!(first.password, second.password);
        assert_eq!(first.admin_password, second.admin_password);
        assert_eq!(first.port, second.port);
        assert_ne!(first.password, first.admin_password);
        let connection = first.connection();
        assert!(connection
            .database_url
            .starts_with("postgresql://pos_retail_app:"));
        assert!(connection.database_url.ends_with("/pos_retail_enterprise"));
    }
    #[test]
    fn corrupt_metadata_and_missing_credentials_are_not_replaced() {
        let directory = TestDirectory::new();
        let paths = directory.paths();
        assert!(credentials(&paths, true).is_err());
        fs::write(&paths.credentials, "{broken-secret").unwrap();
        assert!(credentials(&paths, false).is_err());
        assert_eq!(
            fs::read_to_string(&paths.credentials).unwrap(),
            "{broken-secret"
        );
    }
    #[test]
    fn metadata_rejects_injection_and_incompatible_versions() {
        let directory = TestDirectory::new();
        let paths = directory.paths();
        let mut metadata = credentials(&paths, false).unwrap();
        metadata.user = "unsafe';--".into();
        assert!(metadata.validate().is_err());
        metadata.user = USER.into();
        metadata.port = 543;
        assert!(metadata.validate().is_err());
        metadata.port = DEFAULT_PORT;
        metadata.postgres_major = 18;
        assert!(metadata.validate().is_err());
        metadata.postgres_major = MAJOR;
        metadata.schema_version = 2;
        assert!(metadata.validate().is_err());
        metadata.schema_version = 1;
        metadata.password = "short".into();
        assert!(metadata.validate().is_err());
    }
    #[test]
    fn existing_data_is_preserved_and_major_is_checked() {
        let directory = TestDirectory::new();
        let paths = directory.paths();
        assert!(!validate_version(&paths.data).unwrap());
        fs::create_dir(&paths.data).unwrap();
        fs::write(paths.data.join("partial"), "keep").unwrap();
        assert!(validate_version(&paths.data).is_err());
        fs::write(paths.data.join("PG_VERSION"), "16\n").unwrap();
        assert!(validate_version(&paths.data).is_err());
        fs::write(paths.data.join("PG_VERSION"), "17\n").unwrap();
        assert!(validate_version(&paths.data).unwrap());
        assert_eq!(
            fs::read_to_string(paths.data.join("partial")).unwrap(),
            "keep"
        );
    }
    #[test]
    fn incomplete_bundle_fails_without_path_lookup() {
        let directory = TestDirectory::new();
        let error = Bundle::validate(directory.0.clone()).err().unwrap();
        assert!(error.contains("bin/initdb.exe"));
        fs::create_dir(directory.0.join("bin")).unwrap();
        for name in [
            "initdb.exe",
            "pg_ctl.exe",
            "psql.exe",
            "pg_isready.exe",
            "postgres.exe",
            "vcruntime140.dll",
            "vcruntime140_1.dll",
            "msvcp140.dll",
        ] {
            fs::write(directory.0.join("bin").join(name), "").unwrap();
        }
        assert!(Bundle::validate(directory.0.clone())
            .err()
            .unwrap()
            .contains("lib"));
    }
    #[test]
    fn temporary_password_is_deleted_on_drop() {
        let directory = TestDirectory::new();
        let temporary = Temporary::create(&directory.0, "password", b"secret").unwrap();
        let path = temporary.path.clone();
        assert!(path.exists());
        drop(temporary);
        assert!(!path.exists());
    }
    #[test]
    fn pid_file_must_match_own_directory() {
        let directory = TestDirectory::new();
        let paths = directory.paths();
        fs::create_dir(&paths.data).unwrap();
        fs::write(
            paths.data.join("postmaster.pid"),
            "123\nwrong-directory\n100\n55432\n",
        )
        .unwrap();
        assert!(read_identity(&paths).is_err());
        let data = native_path(&fs::canonicalize(&paths.data).unwrap());
        fs::write(
            paths.data.join("postmaster.pid"),
            format!("123\n{}\n100\n55432\n", data.display()),
        )
        .unwrap();
        assert_eq!(
            read_identity(&paths).unwrap(),
            Identity {
                pid: 123,
                started: 100,
                port: 55432
            }
        );
    }
    #[test]
    fn psql_uses_explicit_connection_and_no_password_arguments() {
        let directory = TestDirectory::new();
        let paths = directory.paths();
        let credentials = credentials(&paths, false).unwrap();
        let running = Running {
            paths,
            credentials,
            bundle: Bundle {
                root: directory.0.join("bundle with spaces"),
            },
            child: None,
            identity: None,
        };
        let cmd = psql(&running, DATABASE, false);
        let args: Vec<_> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"--no-password".into()));
        assert!(args.contains(&"--no-psqlrc".into()));
        assert!(args.contains(&"--host=127.0.0.1".into()));
        assert!(args
            .iter()
            .all(|arg| !arg.contains(&running.credentials.password)
                && !arg.contains(&running.credentials.admin_password)));
        assert!(cmd
            .get_envs()
            .any(|(k, v)| k == "PGCONNECT_TIMEOUT" && v == Some(std::ffi::OsStr::new("3"))));
    }
    #[test]
    fn logs_redact_both_secrets() {
        assert_eq!(
            redact("first second first".into(), &["first", "second"]),
            "[REDACTED] [REDACTED] [REDACTED]"
        );
    }
    #[cfg(windows)]
    #[test]
    fn sid_parser_accepts_domain_users_and_rejects_injection() {
        assert_eq!(
            current_sid("\"DOMAIN\\user name\",\"S-1-5-21-123-456-789-1001\"\r\n").unwrap(),
            "S-1-5-21-123-456-789-1001"
        );
        assert!(current_sid("\"user\",\"S-1-5-21&bad\"").is_err());
    }
    #[cfg(windows)]
    #[test]
    fn normalizes_verbatim_paths() {
        assert_eq!(
            native_path(Path::new(r"\\?\C:\Users\name with spaces\data")),
            PathBuf::from(r"C:\Users\name with spaces\data")
        );
        assert_eq!(
            native_path(Path::new(r"\\?\UNC\server\share\data")),
            PathBuf::from(r"\\server\share\data")
        );
    }
}
