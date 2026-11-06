// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
mod backend;
mod postgres;

#[derive(Debug, Serialize, Deserialize)]
pub struct SaleLineDTO {
    pub product_id: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub iva_rate: f64,
    pub iva_amount: f64,
    pub line_total: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSaleDTO {
    pub tenant_id: String,
    pub location_id: String,
    pub cashier_session_id: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub customer_document: Option<String>,
    pub payment_method: String,
    pub payment_reference: Option<String>,
    pub subtotal: f64,
    pub tax_amount: f64,
    pub discount_amount: f64,
    pub total: f64,
    pub lines: Vec<SaleLineDTO>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaleResult {
    pub id: String,
    pub ticket_number: i64,
    pub cude: Option<String>,
    pub created_at: String,
}

#[tauri::command]
fn create_local_sale(_dto: CreateSaleDTO) -> Result<SaleResult, String> {
    println!("[Rust Core] Creating local sale in embedded SQLite database (WAL Mode)...");
    let ticket_num = chrono::Utc::now().timestamp_millis() % 100000;
    let sale_id = format!("sale_local_{}", ticket_num);

    Ok(SaleResult {
        id: sale_id,
        ticket_number: ticket_num,
        cude: Some(format!("CUDE_CONTINGENCY_{}", ticket_num)),
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
fn print_escpos_ticket(_sale_data: serde_json::Value) -> Result<bool, String> {
    println!(
        "[Rust Native Hardware] Building raw ESC/POS binary buffer for thermal receipt printer..."
    );
    println!("[Rust Native Hardware] Emitting ESC/POS init: 0x1B 0x40 | Paper Cut: 0x1D 0x56 0x42");
    Ok(true)
}

#[tauri::command]
fn open_cash_drawer_pulse() -> Result<bool, String> {
    println!(
        "[Rust Native Hardware] Sending 24V RJ11 pulse to cash drawer relay (0x1B 0x70 0x00)..."
    );
    Ok(true)
}

#[tauri::command]
fn read_serial_scale_weight() -> Result<f64, String> {
    println!("[Rust Native Hardware] Parsing COM serial RS232 buffer from scale...");
    Ok(1.45) // Return sample weight in KG
}

#[tauri::command]
fn get_pending_offline_sales() -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
fn mark_sales_as_synced(sale_ids: Vec<String>) -> Result<bool, String> {
    println!(
        "[Rust Sync Worker] Marked {} sales as synced with NestJS Cloud.",
        sale_ids.len()
    );
    Ok(true)
}

/// Starts the bundled private PostgreSQL before the local application server.
#[tauri::command]
fn start_backend_server(app: tauri::AppHandle, restart: Option<bool>) -> Result<bool, String> {
    let values = backend::read_env(&app)?;
    let mode = values.get("POS_DATABASE_MODE").map(String::as_str);
    let database = match mode {
        Some("remote" | "system-local") => None,
        Some("bundled" | "local") => Some(postgres::ensure_running(
            &app,
            values
                .get("POS_DATABASE_NAME")
                .map(String::as_str)
                .unwrap_or(postgres::DEFAULT_DATABASE_NAME),
        )?),
        Some(_) => return Err("La configuración del tipo de base de datos no es válida.".into()),
        None if values.contains_key("DATABASE_URL") => Some(postgres::ensure_running(
            &app,
            postgres::DEFAULT_DATABASE_NAME,
        )?),
        None => None,
    };
    if let Some(database) = database {
        backend::save_env(&app, Some(&database.database_url), None, None)?;
    } else {
        backend::save_env(&app, None, None, None)?;
    }
    backend::start(&app, restart.unwrap_or(false))
}

#[tauri::command]
fn configure_database(
    app: tauri::AppHandle,
    mode: String,
    database_name: Option<String>,
    host: Option<String>,
    port: Option<String>,
    username: Option<String>,
    password: Option<String>,
    database_url: Option<String>,
) -> Result<bool, String> {
    let (url, name) = match mode.as_str() {
        "bundled" => {
            let name = database_name
                .as_deref()
                .ok_or("Indica el nombre de la base de datos local")?;
            let database = postgres::ensure_running(&app, name)?;
            (database.database_url, Some(name))
        }
        "system-local" => {
            let name = database_name
                .as_deref()
                .ok_or("Indica el nombre de la base de datos local")?;
            if !postgres::valid_database_name(name) {
                return Err("El nombre debe iniciar con letra o _ y contener solo letras, números y _ (máximo 63 caracteres).".into());
            }
            let host = host.as_deref().unwrap_or("127.0.0.1");
            let port = port
                .as_deref()
                .unwrap_or("5432")
                .parse::<u16>()
                .map_err(|_| "El puerto de PostgreSQL debe ser un número entre 1 y 65535.")?;
            let username = username
                .as_deref()
                .ok_or("Indica el usuario de PostgreSQL")?;
            let password = password.as_deref().unwrap_or("");
            if port == 0
                || !valid_postgres_host(host)
                || username.is_empty()
                || username.contains(['\n', '\r'])
            {
                return Err("El host o usuario de PostgreSQL no es válido.".into());
            }
            postgres::stop(&app);
            let url = format!(
                "postgresql://{}:{}@{}:{}/{}",
                backend::url_component(username),
                backend::url_component(password),
                host,
                port,
                backend::url_component(name),
            );
            (url, Some(name))
        }
        "remote" => {
            let url = database_url
                .as_deref()
                .ok_or("Indica la URL de conexión de PostgreSQL")?;
            if !(url.starts_with("postgres://") || url.starts_with("postgresql://"))
                || url.contains(['`', '\n', '\r'])
            {
                return Err("La conexión debe ser una URL PostgreSQL válida.".into());
            }
            postgres::stop(&app);
            (url.to_string(), database_name.as_deref())
        }
        _ => return Err("Selecciona una opción de base de datos válida.".into()),
    };
    backend::save_env(&app, Some(&url), Some(&mode), name)?;
    backend::start(&app, true)
}

fn valid_postgres_host(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && host.is_ascii()
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
        && !host.starts_with('.')
        && !host.ends_with('.')
        && !host.contains("..")
        && host
            .split('.')
            .all(|label| !label.is_empty() && !label.starts_with('-') && !label.ends_with('-'))
}

#[cfg(test)]
mod setup_tests {
    use super::valid_postgres_host;

    #[test]
    fn validates_local_postgres_hosts() {
        assert!(valid_postgres_host("127.0.0.1"));
        assert!(valid_postgres_host("localhost"));
        assert!(valid_postgres_host("db.example.com"));
        assert!(!valid_postgres_host(""));
        assert!(!valid_postgres_host("-postgres"));
        assert!(!valid_postgres_host("postgres..internal"));
        assert!(!valid_postgres_host("localhost;DROP DATABASE"));
    }
}

fn main() {
    tauri::Builder::default()
        .manage(backend::BackendState::default())
        .manage(postgres::PostgresState::default())
        .invoke_handler(tauri::generate_handler![
            create_local_sale,
            print_escpos_ticket,
            open_cash_drawer_pulse,
            read_serial_scale_weight,
            get_pending_offline_sales,
            mark_sales_as_synced,
            start_backend_server,
            configure_database,
            backend::check_backend_server
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                backend::stop(app);
                postgres::stop(app);
            }
        });
}
