mod backup;
mod crypto;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(db::DbState::default())
        .invoke_handler(tauri::generate_handler![
            db::db_status,
            db::db_open,
            db::change_password,
            db::entries_list,
            db::entry_get,
            db::entry_save,
            db::entry_delete,
            db::settings_get_all,
            db::settings_set,
            db::import_photo,
            db::import_photo_bytes,
            db::photo_data,
            backup::create_backup,
            backup::restore_backup,
            backup::export_markdown,
            backup::export_json,
            backup::import_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
