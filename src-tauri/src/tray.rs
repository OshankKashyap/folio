use crate::db::{self, Database};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct TrayState {
    update: tauri::async_runtime::Mutex<()>,
    handle: Mutex<Option<backend::Handle>>,
    tray_only: AtomicBool,
}

/// Hides the window for a `--minimized` launch and keeps the tray icon alive
/// until the window is shown for the first time.
pub fn start_hidden(app: &AppHandle) {
    app.state::<TrayState>()
        .tray_only
        .store(true, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    if app
        .state::<TrayState>()
        .tray_only
        .swap(false, Ordering::SeqCst)
    {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            // Tray-only mode is over, so honor the stored setting again.
            if let Err(error) = sync(&app).await {
                eprintln!("Could not update the Folio tray icon: {error}");
            }
        });
    }
}

pub fn exists(app: &AppHandle) -> bool {
    app.state::<TrayState>()
        .handle
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(backend::is_active)
}

pub async fn sync(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<TrayState>();
    // Serialize startup and setting changes; re-read after locking so an older
    // request cannot recreate the icon after a newer setting has turned it off.
    let _update = state.update.lock().await;
    let enabled = app
        .state::<Database>()
        .run(db::get_minimize_to_tray)
        .await
        .map_err(|error| format!("{error:?}"))?;
    // The tray is the only way back while the app started hidden, even when
    // "Minimize to tray when closed" is off.
    let enabled = enabled || state.tray_only.load(Ordering::SeqCst);
    if enabled && exists(app) {
        return Ok(());
    }
    let old = state.handle.lock().unwrap().take();
    if let Some(handle) = old {
        backend::remove(app, handle).await;
    }
    if enabled {
        let handle = backend::create(app).await?;
        *state.handle.lock().unwrap() = Some(handle);
    }
    Ok(())
}

#[cfg(target_os = "linux")]
mod backend {
    use super::*;
    use ksni::TrayMethods;

    pub type Handle = ksni::Handle<FolioTray>;

    pub struct FolioTray {
        app: AppHandle,
        icon: ksni::Icon,
    }

    impl ksni::Tray for FolioTray {
        fn id(&self) -> String {
            "Folio".into()
        }

        fn title(&self) -> String {
            "Folio".into()
        }

        fn icon_pixmap(&self) -> Vec<ksni::Icon> {
            vec![self.icon.clone()]
        }

        fn tool_tip(&self) -> ksni::ToolTip {
            ksni::ToolTip {
                title: "Folio".into(),
                ..Default::default()
            }
        }

        fn activate(&mut self, _x: i32, _y: i32) {
            show_main_window(&self.app);
        }

        fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
            vec![
                ksni::menu::StandardItem {
                    label: "Open Folio".into(),
                    activate: Box::new(|tray: &mut Self| show_main_window(&tray.app)),
                    ..Default::default()
                }
                .into(),
                ksni::menu::StandardItem {
                    label: "Quit".into(),
                    activate: Box::new(|tray: &mut Self| tray.app.exit(0)),
                    ..Default::default()
                }
                .into(),
            ]
        }

        fn watcher_offline(&self, _reason: ksni::OfflineReason) -> bool {
            // A stopped service makes the close guard fail open.
            false
        }
    }

    pub async fn create(app: &AppHandle) -> Result<Handle, String> {
        let image = app
            .default_window_icon()
            .ok_or("The bundled Folio icon is unavailable")?;
        let icon = ksni::Icon {
            width: image.width() as i32,
            height: image.height() as i32,
            // StatusNotifierItem uses network-order ARGB, Tauri provides RGBA.
            data: image
                .rgba()
                .as_chunks::<4>()
                .0
                .iter()
                .flat_map(|[r, g, b, a]| [*a, *r, *g, *b])
                .collect(),
        };
        FolioTray {
            app: app.clone(),
            icon,
        }
        .spawn()
        .await
        .map_err(|error| error.to_string())
    }

    pub fn is_active(handle: &Handle) -> bool {
        !handle.is_closed()
    }

    pub async fn remove(_app: &AppHandle, handle: Handle) {
        handle.shutdown().await;
    }
}

#[cfg(not(target_os = "linux"))]
mod backend {
    use super::*;
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

    pub type Handle = TrayIcon;

    pub async fn create(app: &AppHandle) -> Result<Handle, String> {
        let build = || -> tauri::Result<Handle> {
            let open = MenuItem::with_id(app, "open", "Open Folio", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let icon = app.default_window_icon().ok_or_else(|| {
                std::io::Error::other("The bundled Folio icon is unavailable")
            })?;
            TrayIconBuilder::new()
                .icon(icon.clone())
                .tooltip("Folio")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)
        };
        build().map_err(|error| error.to_string())
    }

    pub fn is_active(_handle: &Handle) -> bool {
        true
    }

    pub async fn remove(app: &AppHandle, handle: Handle) {
        app.remove_tray_by_id(handle.id());
    }
}
