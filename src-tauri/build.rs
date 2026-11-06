fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "create_local_sale",
            "print_escpos_ticket",
            "open_cash_drawer_pulse",
            "read_serial_scale_weight",
            "get_pending_offline_sales",
            "mark_sales_as_synced",
            "start_backend_server",
            "configure_database",
            "check_backend_server",
        ]),
    ))
    .expect("failed to build Tauri command permissions")
}
