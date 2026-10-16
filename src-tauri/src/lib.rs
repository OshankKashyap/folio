mod db;
mod window_layout;

use db::{AppError, Database, RecordInput, SavedView, Workspace};
use tauri::{Manager, State};
use window_layout::WindowButtonLayout;

#[tauri::command]
async fn load_workspace(database: State<'_, Database>) -> Result<Workspace, AppError> {
    database.run(db::load).await
}

#[tauri::command]
async fn setup_workspace(
    database: State<'_, Database>,
    name: String,
    accent_color: String,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::setup_workspace(connection, &name, &accent_color))
        .await
}

#[tauri::command]
async fn create_database(
    database: State<'_, Database>,
    name: String,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::create_database(connection, &name))
        .await
}

#[tauri::command]
async fn create_record(
    database: State<'_, Database>,
    database_id: i64,
    status: String,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::create_record(connection, database_id, &status))
        .await
}

#[tauri::command]
async fn update_record(
    database: State<'_, Database>,
    input: RecordInput,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::update_record(connection, input))
        .await
}

#[tauri::command]
async fn delete_record(database: State<'_, Database>, id: i64) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::delete_record(connection, id))
        .await
}

#[tauri::command]
async fn update_view(
    database: State<'_, Database>,
    view: SavedView,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::update_view(connection, view))
        .await
}

#[tauri::command]
async fn reorder_record(
    database: State<'_, Database>,
    database_id: i64,
    record_id: i64,
    target_id: i64,
    after: bool,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| {
            db::reorder_record(connection, database_id, record_id, target_id, after)
        })
        .await
}

#[tauri::command]
async fn get_window_button_layout() -> WindowButtonLayout {
    tauri::async_runtime::spawn_blocking(window_layout::detect)
        .await
        .unwrap_or_else(|error| {
            eprintln!("Window button layout detection failed: {error}");
            window_layout::default_layout()
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            app.manage(Database::open(&directory.join("folio.sqlite3"))?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            setup_workspace,
            create_database,
            create_record,
            update_record,
            delete_record,
            update_view,
            reorder_record,
            get_window_button_layout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
