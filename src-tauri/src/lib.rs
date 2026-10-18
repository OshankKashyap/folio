mod database_icons;
mod db;
mod fonts;
mod window_layout;

use db::{AppError, Database, RecordInput, SavedView, Workspace};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
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
async fn set_font_family(
    database: State<'_, Database>,
    font_family: String,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::set_font_family(connection, &font_family))
        .await
}

#[tauri::command]
async fn set_sidebar_width(
    database: State<'_, Database>,
    sidebar_width: Option<i64>,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::set_sidebar_width(connection, sidebar_width))
        .await
}

#[tauri::command]
async fn set_window_button_layout(
    database: State<'_, Database>,
    window_button_layout: String,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::set_window_button_layout(connection, &window_button_layout))
        .await
}

#[tauri::command]
async fn create_database(
    database: State<'_, Database>,
    name: String,
    emoji: Option<String>,
    custom_icon: Option<String>,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| {
            db::create_database(connection, &name, emoji.as_deref(), custom_icon.as_deref())
        })
        .await
}

#[tauri::command]
async fn pick_database_icon(window: tauri::WebviewWindow) -> Result<Option<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = window
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Choose database icon")
            .add_filter("Images (PNG, JPEG, WebP)", &["png", "jpg", "jpeg", "webp"])
            .blocking_pick_file();
        selected
            .map(|file| {
                let path = file.into_path().map_err(|_| {
                    AppError::invalid("Could not read this image. Please try again.")
                })?;
                database_icons::read_icon(&path)
            })
            .transpose()
    })
    .await
    .map_err(|_| AppError::invalid("The system file chooser is unavailable. Please try again."))?
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
async fn get_record_page(
    database: State<'_, Database>,
    record_id: i64,
) -> Result<String, AppError> {
    database
        .run(move |connection| db::get_record_page(connection, record_id))
        .await
}

#[tauri::command]
async fn save_record_page(
    database: State<'_, Database>,
    record_id: i64,
    content: String,
) -> Result<String, AppError> {
    database
        .run(move |connection| db::save_record_page(connection, record_id, &content))
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

#[tauri::command]
async fn get_default_font() -> Result<String, &'static str> {
    tauri::async_runtime::spawn_blocking(fonts::default_font)
        .await
        .map_err(|_| "System font detection is unavailable.")?
}

#[tauri::command]
async fn check_font_available(font_family: String) -> Result<bool, &'static str> {
    tauri::async_runtime::spawn_blocking(move || fonts::is_available(&font_family))
        .await
        .map_err(|_| "System font detection is unavailable.")?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            app.manage(Database::open(&directory.join("folio.sqlite3"))?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            setup_workspace,
            set_font_family,
            set_sidebar_width,
            set_window_button_layout,
            get_default_font,
            check_font_available,
            create_database,
            pick_database_icon,
            create_record,
            update_record,
            delete_record,
            get_record_page,
            save_record_page,
            update_view,
            reorder_record,
            get_window_button_layout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
