mod columns;
mod database_icons;
mod db;
mod fonts;
mod tray;
mod window_layout;

use db::{AppError, Database, RecordInput, SavedView, Workspace};
use columns::{ColumnOption, PropertyValue};
use std::path::{Path, PathBuf};
use tauri::{Manager, State};
use tauri_plugin_autostart::ManagerExt;
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
async fn set_minimize_to_tray(
    app: tauri::AppHandle,
    database: State<'_, Database>,
    minimize_to_tray: bool,
) -> Result<Workspace, AppError> {
    let workspace = database
        .run(move |connection| db::set_minimize_to_tray(connection, minimize_to_tray))
        .await?;
    if let Err(error) = tray::sync(&app).await {
        eprintln!("Could not update the Folio tray icon: {error}");
    }
    Ok(workspace)
}

#[tauri::command]
async fn is_dev_build() -> bool {
    tauri::is_dev()
}

#[tauri::command]
async fn is_linux() -> bool {
    cfg!(target_os = "linux")
}

#[tauri::command]
async fn set_gpu_acceleration(
    database: State<'_, Database>,
    gpu_acceleration: bool,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::set_gpu_acceleration(connection, gpu_acceleration))
        .await
}

fn validate_autostart(autostart: bool, dev: bool) -> Result<(), AppError> {
    if autostart && dev {
        return Err(AppError::invalid(
            "Autostart is unavailable in development builds of Folio.",
        ));
    }
    Ok(())
}

#[tauri::command]
async fn set_autostart(
    app: tauri::AppHandle,
    database: State<'_, Database>,
    autostart: bool,
) -> Result<Workspace, AppError> {
    validate_autostart(autostart, tauri::is_dev())?;
    // Register with the OS first so the stored setting never claims an entry
    // that was not created.
    if !tauri::is_dev() {
        let manager = app.autolaunch();
        let updated = if autostart {
            manager.enable()
        } else {
            manager.disable()
        };
        updated.map_err(|error| {
            eprintln!("Could not update the Folio autostart entry: {error}");
            AppError::invalid("Could not update the autostart setting. Please try again.")
        })?;
    }
    database
        .run(move |connection| db::set_autostart(connection, autostart))
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
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| db::create_record(connection, database_id))
        .await
}

#[tauri::command]
async fn create_column(
    database: State<'_, Database>,
    database_id: i64,
    name: String,
    column_type: String,
    options: Option<Vec<ColumnOption>>,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| {
            columns::create_column(connection, database_id, &name, &column_type, options)
        })
        .await
}

#[tauri::command]
async fn rename_column(
    database: State<'_, Database>,
    column_id: i64,
    name: String,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| columns::rename_column(connection, column_id, &name))
        .await
}

#[tauri::command]
async fn delete_column(
    database: State<'_, Database>,
    column_id: i64,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| columns::delete_column(connection, column_id))
        .await
}

#[tauri::command]
async fn set_column_options(
    database: State<'_, Database>,
    column_id: i64,
    options: Vec<ColumnOption>,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| columns::set_column_options(connection, column_id, options))
        .await
}

#[tauri::command]
async fn set_record_value(
    database: State<'_, Database>,
    record_id: i64,
    column_id: i64,
    value: Option<PropertyValue>,
) -> Result<Workspace, AppError> {
    database
        .run(move |connection| columns::set_record_value(connection, record_id, column_id, value))
        .await
}

#[tauri::command]
async fn add_inline_option(
    database: State<'_, Database>,
    column_id: i64,
    label: String,
) -> Result<(i64, Workspace), AppError> {
    database
        .run(move |connection| columns::add_inline_option(connection, column_id, &label))
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
async fn delete_records(
    database: State<'_, Database>,
    record_ids: Vec<i64>,
) -> Result<usize, AppError> {
    if record_ids.is_empty() {
        return Ok(0);
    }
    database
        .run(move |connection| db::delete_records(connection, &record_ids))
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

fn production_data_dir(home: &Path) -> PathBuf {
    home.join(".folio")
}

#[cfg(target_os = "linux")]
fn workspace_data_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let home = || std::env::home_dir().ok_or("Could not resolve the home directory");
    if tauri::is_dev() {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .map(Ok)
            .unwrap_or_else(|| home().map(|path| path.join(".local/share")))?;
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))?;
        let identifier = config["identifier"].as_str().ok_or("Missing application identifier")?;
        Ok(base.join(identifier))
    } else {
        Ok(production_data_dir(&home()?))
    }
}

pub fn disable_gpu_compositing(stored_setting: Option<bool>, linux: bool) -> bool {
    linux && stored_setting == Some(false)
}

#[cfg(target_os = "linux")]
pub fn startup_gpu_acceleration() -> Option<bool> {
    let result = workspace_data_dir().and_then(|directory| {
        db::read_gpu_acceleration(&directory.join("folio.sqlite3")).map_err(Into::into)
    });
    match result {
        Ok(Some(enabled)) => Some(enabled),
        Ok(None) => {
            eprintln!("No stored GPU acceleration setting; using WebKit defaults.");
            None
        }
        Err(error) => {
            eprintln!("Could not read GPU acceleration setting; using WebKit defaults: {error}");
            None
        }
    }
}

fn restore_autostart(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let enabled = match app.state::<Database>().run(db::get_autostart).await {
            Ok(enabled) => enabled,
            Err(error) => {
                eprintln!("Could not read the Folio autostart setting: {error:?}");
                return;
            }
        };
        if !enabled {
            return;
        }
        let manager = app.autolaunch();
        match manager.is_enabled() {
            Ok(true) => {}
            Ok(false) => {
                if let Err(error) = manager.enable() {
                    eprintln!("Could not restore the Folio autostart entry: {error}");
                }
            }
            Err(error) => eprintln!("Could not check the Folio autostart entry: {error}"),
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            tray::show_main_window(app);
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Folio")
                .arg("--minimized")
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            let directory = workspace_data_dir()?;
            #[cfg(not(target_os = "linux"))]
            let directory = if tauri::is_dev() {
                app.path().app_data_dir()?
            } else {
                production_data_dir(&app.path().home_dir()?)
            };
            std::fs::create_dir_all(&directory)?;
            app.manage(Database::open(&directory.join("folio.sqlite3"))?);
            app.manage(tray::TrayState::default());
            if std::env::args().any(|argument| argument == "--minimized") {
                tray::start_hidden(app.handle());
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = tray::sync(&handle).await {
                    eprintln!("Could not create the Folio tray icon: {error}");
                }
            });
            if !tauri::is_dev() {
                restore_autostart(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && let tauri::WindowEvent::CloseRequested { api, .. } = event
                && window.state::<Database>().minimize_to_tray().unwrap_or(false)
                && tray::exists(window.app_handle())
            {
                // A failed hide must not leave an unclosable window.
                if window.hide().is_ok() {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            setup_workspace,
            set_font_family,
            set_sidebar_width,
            set_window_button_layout,
            set_minimize_to_tray,
            set_autostart,
            set_gpu_acceleration,
            is_dev_build,
            is_linux,
            get_default_font,
            check_font_available,
            create_database,
            pick_database_icon,
            create_record,
            create_column,
            rename_column,
            delete_column,
            set_column_options,
            set_record_value,
            add_inline_option,
            update_record,
            delete_record,
            delete_records,
            get_record_page,
            save_record_page,
            update_view,
            reorder_record,
            get_window_button_layout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gpu_compositing_is_disabled_only_for_explicit_off_on_linux() {
        for (setting, linux, expected) in [
            (Some(false), true, true),
            (Some(true), true, false),
            (None, true, false), // Missing setting or read failure: WebKit defaults.
            (Some(false), false, false),
            (Some(true), false, false),
            (None, false, false),
        ] {
            assert_eq!(disable_gpu_compositing(setting, linux), expected);
        }
    }

    #[test]
    fn autostart_registration_is_refused_in_development_builds() {
        assert!(validate_autostart(true, true).is_err());
        assert!(validate_autostart(false, true).is_ok());
        assert!(validate_autostart(true, false).is_ok());
        assert!(validate_autostart(false, false).is_ok());
    }

    #[test]
    fn production_data_dir_uses_home() {
        assert_eq!(
            production_data_dir(Path::new("/home/folio")),
            PathBuf::from("/home/folio/.folio")
        );
    }

    #[test]
    fn production_data_dir_accepts_relative_and_unusual_paths() {
        for (home, expected) in [
            ("", ".folio"),
            (".", "./.folio"),
            ("../relative", "../relative/.folio"),
            ("home with spaces/用户", "home with spaces/用户/.folio"),
        ] {
            assert_eq!(production_data_dir(Path::new(home)), PathBuf::from(expected));
        }
    }
}
