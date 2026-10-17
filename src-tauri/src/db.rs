use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Debug, Serialize)]
pub struct AppError {
    code: &'static str,
    message: &'static str,
}

impl AppError {
    pub(crate) fn invalid(message: &'static str) -> Self {
        Self {
            code: "invalid_input",
            message,
        }
    }

    fn missing() -> Self {
        Self {
            code: "not_found",
            message: "This item no longer exists. Reload the workspace and try again.",
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        eprintln!("SQLite operation failed: {error}");
        Self {
            code: "storage_error",
            message: "Your changes could not be saved. Please try again.",
        }
    }
}

pub struct Database(Arc<Mutex<Connection>>);

impl Database {
    pub fn open(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        migrate(&mut connection)?;
        Ok(Self(Arc::new(Mutex::new(connection))))
    }

    pub async fn run<T, F>(&self, operation: F) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> Result<T, AppError> + Send + 'static,
    {
        let connection = Arc::clone(&self.0);
        tauri::async_runtime::spawn_blocking(move || {
            let mut connection = connection.lock().map_err(|_| AppError {
                code: "storage_unavailable",
                message: "Storage is unavailable. Please restart Folio.",
            })?;
            operation(&mut connection)
        })
        .await
        .map_err(|error| {
            eprintln!("Storage task failed: {error}");
            AppError {
                code: "storage_unavailable",
                message: "Storage is unavailable. Please restart Folio.",
            }
        })?
    }
}

fn migrate(connection: &mut Connection) -> rusqlite::Result<()> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let version: i64 = transaction.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > 5 {
        return Err(rusqlite::Error::InvalidParameterName(
            "This workspace requires a newer version of Folio".into(),
        ));
    }
    if version == 0 {
        transaction.execute_batch(include_str!("../migrations/001_workspace.sql"))?;
    }
    if version < 2 {
        transaction.execute_batch(include_str!("../migrations/002_workspace_setup.sql"))?;
    }
    if version < 3 {
        transaction.execute_batch(include_str!("../migrations/003_interface_font.sql"))?;
    }
    if version < 4 {
        transaction.execute_batch(include_str!("../migrations/004_database_icons.sql"))?;
    }
    if version < 5 {
        transaction.execute_batch(include_str!("../migrations/005_record_pages.sql"))?;
    }
    transaction.commit()?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDatabase {
    id: i64,
    name: String,
    description: String,
    icon: String,
    emoji: String,
    custom_icon: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedView {
    pub id: i64,
    pub database_id: i64,
    pub name: String,
    pub layout: String,
    pub filter_active: bool,
    pub sort_active: bool,
    pub compact: bool,
    pub show_owner: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: i64,
    pub database_id: i64,
    pub name: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub owner: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordInput {
    pub id: i64,
    pub name: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub owner: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    name: String,
    accent_color: String,
    font_family: String,
}

#[derive(Serialize)]
pub struct Workspace {
    settings: Option<WorkspaceSettings>,
    databases: Vec<WorkspaceDatabase>,
    pub views: Vec<SavedView>,
    pub records: Vec<Record>,
}

pub fn load(connection: &mut Connection) -> Result<Workspace, AppError> {
    let settings = connection
        .query_row(
            "SELECT name, accent_color, font_family FROM workspace_settings WHERE id = 1",
            [],
            |row| {
                Ok(WorkspaceSettings {
                    name: row.get(0)?,
                    accent_color: row.get(1)?,
                    font_family: row.get(2)?,
                })
            },
        )
        .optional()?;
    let databases = connection
        .prepare("SELECT id, name, description, icon, emoji, custom_icon FROM databases ORDER BY position, id")?
        .query_map([], |row| {
            Ok(WorkspaceDatabase {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                emoji: row.get(4)?,
                custom_icon: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let views = connection.prepare("SELECT id, database_id, name, layout, filter_active, sort_active, compact, show_owner FROM saved_views ORDER BY database_id, position, id")?
        .query_map([], |row| Ok(SavedView { id: row.get(0)?, database_id: row.get(1)?, name: row.get(2)?, layout: row.get(3)?, filter_active: row.get(4)?, sort_active: row.get(5)?, compact: row.get(6)?, show_owner: row.get(7)? }))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let records = connection.prepare("SELECT id, database_id, name, status, priority, due_date, owner FROM records ORDER BY database_id, position, id")?
        .query_map([], |row| Ok(Record { id: row.get(0)?, database_id: row.get(1)?, name: row.get(2)?, status: row.get(3)?, priority: row.get(4)?, due_date: row.get(5)?, owner: row.get(6)? }))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Workspace {
        settings,
        databases,
        views,
        records,
    })
}

pub fn setup_workspace(
    connection: &mut Connection,
    name: &str,
    accent_color: &str,
) -> Result<Workspace, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid(
            "Enter a workspace name (up to 100 characters).",
        ));
    }
    if accent_color.len() != 7
        || !accent_color.starts_with('#')
        || !accent_color.as_bytes()[1..]
            .iter()
            .all(u8::is_ascii_hexdigit)
    {
        return Err(AppError::invalid("Choose a valid accent color."));
    }
    let changed = connection.execute(
        "INSERT INTO workspace_settings (id, name, accent_color) VALUES (1, ?1, ?2) ON CONFLICT(id) DO NOTHING",
        params![name, accent_color.to_ascii_lowercase()],
    )?;
    if changed == 0 {
        return Err(AppError::invalid(
            "This workspace is already set up. Reload to continue.",
        ));
    }
    load(connection)
}

pub fn set_font_family(
    connection: &mut Connection,
    font_family: &str,
) -> Result<Workspace, AppError> {
    let font_family = font_family.trim();
    if font_family.chars().count() > 200 || font_family.chars().any(char::is_control) {
        return Err(AppError::invalid(
            "Enter a font family name (up to 200 characters).",
        ));
    }
    if connection.execute(
        "UPDATE workspace_settings SET font_family = ?1 WHERE id = 1",
        [font_family],
    )? == 0
    {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn create_database(
    connection: &mut Connection,
    name: &str,
    emoji: Option<&str>,
    custom_icon: Option<&str>,
) -> Result<Workspace, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 200 {
        return Err(AppError::invalid(
            "Enter a database name (up to 200 characters).",
        ));
    }
    let emoji = emoji.unwrap_or_default().trim();
    if emoji.chars().count() > 16 || emoji.chars().any(char::is_control) {
        return Err(AppError::invalid(
            "Choose an emoji (up to 16 characters, without control characters).",
        ));
    }
    let custom_icon = custom_icon.filter(|icon| !icon.is_empty());
    if let Some(icon) = custom_icon {
        validate_custom_icon(icon)?;
    }
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if !transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM workspace_settings)",
        [],
        |row| row.get::<_, bool>(0),
    )? {
        return Err(AppError::invalid("Set up your workspace first."));
    }
    transaction.execute("INSERT INTO databases (name, icon, emoji, custom_icon, position) VALUES (?1, 'layers', ?2, ?3, (SELECT COALESCE(MAX(position), -1) + 1 FROM databases))", params![name, emoji, custom_icon])?;
    let id = transaction.last_insert_rowid();
    transaction.execute("INSERT INTO saved_views (database_id, name, layout, position) VALUES (?1, 'All records', 'table', 0)", [id])?;
    transaction.commit()?;
    load(connection)
}

fn validate_custom_icon(icon: &str) -> Result<(), AppError> {
    let invalid = || {
        AppError::invalid("Choose a PNG, JPEG, or WebP data URI with valid base64 (up to 256 KB).")
    };
    if icon.len() > 350_000 {
        return Err(invalid());
    }
    let payload = ["png", "jpeg", "webp"]
        .iter()
        .find_map(|mime| icon.strip_prefix(&format!("data:image/{mime};base64,")))
        .ok_or_else(invalid)?;
    let data = payload.trim_end_matches('=');
    let padding = payload.len() - data.len();
    // Validate canonical base64 and its exact decoded size without allocating a decoded copy.
    if payload.is_empty()
        || !payload.len().is_multiple_of(4)
        || padding > 2
        || !data
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'/')
        || (padding == 2 && !data.ends_with(['A', 'Q', 'g', 'w']))
        || (padding == 1
            && !data.ends_with([
                'A', 'E', 'I', 'M', 'Q', 'U', 'Y', 'c', 'g', 'k', 'o', 's', 'w', '0', '4', '8',
            ]))
        || payload.len() / 4 * 3 - padding > 256 * 1024
    {
        return Err(invalid());
    }
    Ok(())
}

fn validate_status(status: &str) -> Result<(), AppError> {
    if !["To do", "In progress", "Done"].contains(&status) {
        return Err(AppError::invalid("Choose a valid status."));
    }
    Ok(())
}

pub fn create_record(
    connection: &mut Connection,
    database_id: i64,
    status: &str,
) -> Result<Workspace, AppError> {
    validate_status(status)?;
    let exists = connection
        .query_row(
            "SELECT id FROM databases WHERE id = ?1",
            [database_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()?;
    if exists.is_none() {
        return Err(AppError::missing());
    }
    connection.execute("INSERT INTO records (database_id, name, status, priority, position) VALUES (?1, 'Untitled', ?2, 'Medium', (SELECT COALESCE(MAX(position), -1) + 1 FROM records WHERE database_id = ?1))", params![database_id, status])?;
    load(connection)
}

pub fn update_record(
    connection: &mut Connection,
    input: RecordInput,
) -> Result<Workspace, AppError> {
    let name = input.name.trim();
    let owner = input.owner.trim();
    if name.is_empty() || name.chars().count() > 500 || owner.chars().count() > 200 {
        return Err(AppError::invalid(
            "A title is required (up to 500 characters); owner must be at most 200 characters.",
        ));
    }
    validate_status(&input.status)?;
    if !["High", "Medium", "Low"].contains(&input.priority.as_str()) {
        return Err(AppError::invalid("Choose a valid priority."));
    }
    if let Some(date) = &input.due_date
        && (date.len() != 10 || chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err())
    {
        return Err(AppError::invalid("Choose a valid due date."));
    }
    let changed = connection.execute("UPDATE records SET name = ?1, status = ?2, priority = ?3, due_date = ?4, owner = ?5, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?6", params![name, input.status, input.priority, input.due_date, owner, input.id])?;
    if changed == 0 {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn get_record_page(connection: &mut Connection, record_id: i64) -> Result<String, AppError> {
    connection.query_row(
        "SELECT COALESCE(p.content, '') FROM records r LEFT JOIN record_pages p ON p.record_id = r.id WHERE r.id = ?1",
        [record_id], |row| row.get(0),
    ).optional()?.ok_or_else(AppError::missing)
}

pub fn save_record_page(
    connection: &mut Connection,
    record_id: i64,
    content: &str,
) -> Result<String, AppError> {
    if content.len() > 512 * 1024 {
        return Err(AppError::invalid("Page content must be at most 512 KB."));
    }
    connection.query_row(
        "INSERT INTO record_pages (record_id, content, updated_at) SELECT id, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM records WHERE id = ?1 ON CONFLICT(record_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at RETURNING updated_at",
        params![record_id, content], |row| row.get(0),
    ).optional()?.ok_or_else(AppError::missing)
}

pub fn delete_record(connection: &mut Connection, id: i64) -> Result<Workspace, AppError> {
    if connection.execute("DELETE FROM records WHERE id = ?1", [id])? == 0 {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn update_view(connection: &mut Connection, view: SavedView) -> Result<Workspace, AppError> {
    if !["table", "board", "list"].contains(&view.layout.as_str()) {
        return Err(AppError::invalid("Choose a valid layout."));
    }
    let changed = connection.execute("UPDATE saved_views SET layout = ?1, filter_active = ?2, sort_active = ?3, compact = ?4, show_owner = ?5 WHERE id = ?6 AND database_id = ?7", params![view.layout, view.filter_active, view.sort_active, view.compact, view.show_owner, view.id, view.database_id])?;
    if changed == 0 {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn reorder_record(
    connection: &mut Connection,
    database_id: i64,
    record_id: i64,
    target_id: i64,
    after: bool,
) -> Result<Workspace, AppError> {
    let transaction = connection.transaction()?;
    let mut ids = transaction
        .prepare("SELECT id FROM records WHERE database_id = ?1 ORDER BY position, id")?
        .query_map([database_id], |row| row.get::<_, i64>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if !ids.contains(&record_id) || !ids.contains(&target_id) {
        return Err(AppError::missing());
    }
    if record_id != target_id {
        ids.retain(|id| *id != record_id);
        let target = ids
            .iter()
            .position(|id| *id == target_id)
            .ok_or_else(AppError::missing)?;
        ids.insert(target + usize::from(after), record_id);
        for (position, id) in ids.iter().enumerate() {
            transaction.execute(
                "UPDATE records SET position = ?1 WHERE id = ?2 AND database_id = ?3",
                params![position as i64, id, database_id],
            )?;
        }
    }
    transaction.commit()?;
    load(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connection() -> Connection {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate(&mut db).unwrap();
        db.execute_batch(include_str!("test_seed.sql")).unwrap();
        db
    }

    #[test]
    fn pages_round_trip_upsert_validate_and_cascade() {
        let mut db = connection();
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "");
        let timestamp = save_record_page(&mut db, 1, "# Notes\n**hello**").unwrap();
        assert!(timestamp.ends_with('Z'));
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "# Notes\n**hello**");
        save_record_page(&mut db, 1, "replacement").unwrap();
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "replacement");
        assert_eq!(get_record_page(&mut db, 999).unwrap_err().code, "not_found");
        assert_eq!(
            save_record_page(&mut db, 999, "missing").unwrap_err().code,
            "not_found"
        );
        let maximum = "é".repeat(256 * 1024);
        save_record_page(&mut db, 1, &maximum).unwrap();
        assert_eq!(
            save_record_page(&mut db, 1, &(maximum.clone() + "x"))
                .unwrap_err()
                .code,
            "invalid_input"
        );
        assert_eq!(get_record_page(&mut db, 1).unwrap(), maximum);
        delete_record(&mut db, 1).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM record_pages", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn page_migration_is_additive_and_pages_survive_reopening() {
        let path =
            std::env::temp_dir().join(format!("folio-pages-test-{}.sqlite", std::process::id()));
        {
            let mut db = Connection::open(&path).unwrap();
            db.execute_batch(include_str!("../migrations/001_workspace.sql"))
                .unwrap();
            db.execute_batch(include_str!("../migrations/002_workspace_setup.sql"))
                .unwrap();
            db.execute_batch(include_str!("../migrations/003_interface_font.sql"))
                .unwrap();
            db.execute_batch(include_str!("../migrations/004_database_icons.sql"))
                .unwrap();
            db.execute_batch(include_str!("test_seed.sql")).unwrap();
            let before = serde_json::to_value(load(&mut db).unwrap()).unwrap();
            migrate(&mut db).unwrap();
            assert_eq!(
                serde_json::to_value(load(&mut db).unwrap()).unwrap(),
                before
            );
            assert_eq!(
                db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                    .unwrap(),
                5
            );
            save_record_page(&mut db, 1, "Persist me").unwrap();
        }
        let mut db = Connection::open(&path).unwrap();
        migrate(&mut db).unwrap();
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "Persist me");
        drop(db);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn migration_does_not_reseed() {
        let mut db = connection();
        assert_eq!(load(&mut db).unwrap().records.len(), 10);
        db.execute("DELETE FROM records", []).unwrap();
        migrate(&mut db).unwrap();
        assert!(load(&mut db).unwrap().records.is_empty());
        assert_eq!(load(&mut db).unwrap().views.len(), 9);
    }

    #[test]
    fn failed_migration_rolls_back_and_future_schemas_are_rejected() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE records (id INTEGER PRIMARY KEY);")
            .unwrap();
        assert!(migrate(&mut db).is_err());
        let tables: i64 = db
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'databases'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 0);
        let version: i64 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 0);
        db.pragma_update(None, "user_version", 6).unwrap();
        assert!(migrate(&mut db).is_err());
        let version: i64 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 6);
    }

    #[test]
    fn records_support_create_update_delete_and_validation() {
        let mut db = connection();
        let workspace = create_record(&mut db, 2, "In progress").unwrap();
        let id = workspace
            .records
            .iter()
            .map(|record| record.id)
            .max()
            .unwrap();
        let input = |date: &str| RecordInput {
            id,
            name: " A real book ".into(),
            status: "Done".into(),
            priority: "High".into(),
            due_date: Some(date.into()),
            owner: "Oshank".into(),
        };
        assert!(update_record(&mut db, input("2026-02-30")).is_err());
        let workspace = update_record(&mut db, input("2026-12-01")).unwrap();
        assert_eq!(
            workspace
                .records
                .iter()
                .find(|record| record.id == id)
                .unwrap()
                .name,
            "A real book"
        );
        assert_eq!(delete_record(&mut db, id).unwrap().records.len(), 10);
        assert!(create_record(&mut db, 999, "To do").is_err());
        assert!(create_record(&mut db, 1, "invalid").is_err());
    }

    #[test]
    fn views_are_scoped_to_each_database() {
        let mut db = connection();
        let mut view = load(&mut db).unwrap().views.remove(0);
        let id = view.id;
        view.layout = "list".into();
        view.compact = true;
        update_view(&mut db, view).unwrap();
        let workspace = load(&mut db).unwrap();
        assert_eq!(
            workspace
                .views
                .iter()
                .find(|view| view.id == id)
                .unwrap()
                .layout,
            "list"
        );
        assert!(
            workspace
                .views
                .iter()
                .filter(|view| view.database_id == 2)
                .all(|view| !view.compact)
        );
    }

    #[test]
    fn ordering_is_transactional_and_rejects_cross_database_targets() {
        let mut db = connection();
        let workspace = reorder_record(&mut db, 1, 1, 3, true).unwrap();
        assert_eq!(
            workspace
                .records
                .iter()
                .take(3)
                .map(|record| record.id)
                .collect::<Vec<_>>(),
            vec![2, 3, 1]
        );
        assert!(reorder_record(&mut db, 1, 1, 7, false).is_err());
        assert_eq!(load(&mut db).unwrap().records[2].id, 1);
        db.execute("DELETE FROM databases WHERE id = 1", [])
            .unwrap();
        let workspace = load(&mut db).unwrap();
        assert!(
            workspace
                .records
                .iter()
                .all(|record| record.database_id != 1)
        );
        assert!(workspace.views.iter().all(|view| view.database_id != 1));
    }

    #[test]
    fn failed_reorder_rolls_back_every_position() {
        let mut db = connection();
        db.execute_batch("CREATE TRIGGER fail_order BEFORE UPDATE OF position ON records WHEN NEW.id = 3 BEGIN SELECT RAISE(ABORT, 'test write failure'); END;").unwrap();
        assert!(reorder_record(&mut db, 1, 1, 4, true).is_err());
        assert_eq!(
            load(&mut db)
                .unwrap()
                .records
                .iter()
                .take(6)
                .map(|record| record.id)
                .collect::<Vec<_>>(),
            vec![1, 2, 3, 4, 5, 6]
        );
    }

    #[test]
    fn view_updates_reject_wrong_database_and_invalid_layouts() {
        let mut db = connection();
        let mut view = load(&mut db).unwrap().views.remove(0);
        view.database_id = 2;
        view.show_owner = false;
        assert!(update_view(&mut db, view).is_err());
        let mut view = load(&mut db).unwrap().views.remove(0);
        assert!(view.show_owner);
        view.layout = "invalid".into();
        assert!(update_view(&mut db, view).is_err());
    }

    #[test]
    fn data_and_settings_survive_reopening_the_file() {
        let path =
            std::env::temp_dir().join(format!("folio-setup-test-{}.sqlite", std::process::id()));
        {
            let mut db = Connection::open(&path).unwrap();
            migrate(&mut db).unwrap();
            setup_workspace(&mut db, "My workspace", "#91baff").unwrap();
            set_font_family(&mut db, "Liberation Sans").unwrap();
            let workspace = create_database(
                &mut db,
                "Tasks",
                Some("🚀"),
                Some("data:image/png;base64,AAAA"),
            )
            .unwrap();
            create_record(&mut db, workspace.databases[0].id, "Done").unwrap();
            let mut view = load(&mut db).unwrap().views.remove(0);
            view.show_owner = false;
            update_view(&mut db, view).unwrap();
        }
        let mut db = Connection::open(&path).unwrap();
        migrate(&mut db).unwrap();
        let workspace = load(&mut db).unwrap();
        assert_eq!(workspace.records.len(), 1);
        assert_eq!(workspace.databases[0].emoji, "🚀");
        assert_eq!(
            workspace.databases[0].custom_icon.as_deref(),
            Some("data:image/png;base64,AAAA")
        );
        let settings = workspace.settings.unwrap();
        assert_eq!(settings.name, "My workspace");
        assert_eq!(settings.accent_color, "#91baff");
        assert_eq!(settings.font_family, "Liberation Sans");
        assert!(!workspace.views[0].show_owner);
        drop(db);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn fresh_install_is_empty_and_setup_is_validated() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        let workspace = load(&mut db).unwrap();
        assert!(workspace.settings.is_none());
        assert!(workspace.databases.is_empty());
        assert!(workspace.views.is_empty());
        assert!(workspace.records.is_empty());
        assert!(create_database(&mut db, "Tasks", None, None).is_err());
        for name in ["", "   ", &"x".repeat(101)] {
            assert!(setup_workspace(&mut db, name, "#b8aaf7").is_err());
        }
        for color in ["red", "#fff", "#zzzzzz", "#1234567", "#12345é"] {
            assert!(setup_workspace(&mut db, "Home", color).is_err());
        }
        assert!(load(&mut db).unwrap().settings.is_none());
        let workspace = setup_workspace(&mut db, " Home ", "#B8AAF7").unwrap();
        let settings = workspace.settings.unwrap();
        assert_eq!(settings.name, "Home");
        assert_eq!(settings.accent_color, "#b8aaf7");
        assert!(workspace.databases.is_empty());
        assert!(setup_workspace(&mut db, "Overwrite", "#000000").is_err());
        assert!(create_database(&mut db, "  ", None, None).is_err());
        assert!(create_database(&mut db, &"x".repeat(201), None, None).is_err());
        let workspace = create_database(&mut db, " Tasks ", None, None).unwrap();
        assert_eq!(workspace.databases[0].name, "Tasks");
        assert_eq!(workspace.databases[0].icon, "layers");
        assert_eq!(workspace.databases[0].emoji, "");
        assert!(workspace.databases[0].custom_icon.is_none());
        assert_eq!(workspace.views.len(), 1);
        assert!(workspace.records.is_empty());
    }

    #[test]
    fn font_and_icon_migrations_preserve_existing_workspace_rows() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../migrations/001_workspace.sql"))
            .unwrap();
        db.execute_batch(include_str!("../migrations/002_workspace_setup.sql"))
            .unwrap();
        db.execute_batch(include_str!("test_seed.sql")).unwrap();
        db.execute("INSERT INTO workspace_settings (id, name, accent_color) VALUES (1, 'Keep me', '#91baff')", []).unwrap();
        let snapshot = |db: &Connection| {
            [
                ("databases", "id, name, description, icon, position"),
                ("saved_views", "*"),
                ("records", "*"),
            ]
            .map(|(table, columns)| {
                let mut statement = db
                    .prepare(&format!("SELECT {columns} FROM {table} ORDER BY id"))
                    .unwrap();
                let columns = statement.column_count();
                statement
                    .query_map([], |row| {
                        (0..columns)
                            .map(|index| row.get::<_, rusqlite::types::Value>(index))
                            .collect::<rusqlite::Result<Vec<_>>>()
                    })
                    .unwrap()
                    .collect::<rusqlite::Result<Vec<_>>>()
                    .unwrap()
            })
        };
        let before = snapshot(&db);
        db.execute_batch(include_str!("../migrations/003_interface_font.sql"))
            .unwrap();
        assert_eq!(snapshot(&db), before);
        assert_eq!(
            db.query_row("SELECT font_family FROM workspace_settings", [], |row| {
                row.get::<_, String>(0)
            })
            .unwrap(),
            ""
        );
        db.execute(
            "UPDATE workspace_settings SET font_family = 'Installed Font'",
            [],
        )
        .unwrap();
        migrate(&mut db).unwrap();
        assert_eq!(snapshot(&db), before);
        let workspace = load(&mut db).unwrap();
        assert!(
            workspace
                .databases
                .iter()
                .all(|database| database.emoji.is_empty() && database.custom_icon.is_none())
        );
        let settings = workspace.settings.unwrap();
        assert_eq!(settings.name, "Keep me");
        assert_eq!(settings.accent_color, "#91baff");
        assert_eq!(settings.font_family, "Installed Font");
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            5
        );
        migrate(&mut db).unwrap();
        assert_eq!(snapshot(&db), before);
    }

    #[test]
    fn database_icons_are_validated_and_creation_is_atomic() {
        let mut db = connection();
        setup_workspace(&mut db, "Home", "#91baff").unwrap();
        let before = load(&mut db).unwrap();
        let workspace = create_database(&mut db, "Emoji", Some("  👩‍💻  "), None).unwrap();
        let emoji_database = workspace.databases.last().unwrap();
        assert_eq!(emoji_database.emoji, "👩‍💻");
        assert!(emoji_database.custom_icon.is_none());
        for mime in ["png", "jpeg", "webp"] {
            let icon = format!("data:image/{mime};base64,AA==");
            let workspace = create_database(&mut db, mime, None, Some(&icon)).unwrap();
            assert_eq!(
                workspace.databases.last().unwrap().custom_icon.as_deref(),
                Some(icon.as_str())
            );
        }
        let workspace = create_database(&mut db, "Default", Some("  "), Some("")).unwrap();
        assert_eq!(workspace.databases.last().unwrap().emoji, "");
        assert!(workspace.databases.last().unwrap().custom_icon.is_none());
        let count = workspace.databases.len();
        for emoji in ["⭐".repeat(17), "⭐\n⭐".into()] {
            assert_eq!(
                create_database(&mut db, "Invalid", Some(&emoji), None)
                    .err()
                    .unwrap()
                    .code,
                "invalid_input"
            );
        }
        for icon in [
            "data:image/svg+xml;base64,AAAA".into(),
            "data:text/plain;base64,AAAA".into(),
            "https://example.com/icon.png".into(),
            "data:image/png;base64,".into(),
            "data:image/png;base64,!!!!".into(),
            "data:image/png;base64,AA=A".into(),
            "data:image/png;base64,AB==".into(),
            "data:image/png;base64,AAA".into(),
            format!("data:image/png;base64,{}", "A".repeat(349_528)),
            format!("data:image/png;base64,{}", "A".repeat(350_000)),
        ] {
            assert_eq!(
                create_database(&mut db, "Invalid", None, Some(&icon))
                    .err()
                    .unwrap()
                    .code,
                "invalid_input"
            );
        }
        assert_eq!(load(&mut db).unwrap().databases.len(), count);
        let maximum = format!("data:image/png;base64,{}AA==", "A".repeat(349_524));
        assert!(create_database(&mut db, "Maximum", None, Some(&maximum)).is_ok());
        db.execute_batch("CREATE TRIGGER fail_view BEFORE INSERT ON saved_views BEGIN SELECT RAISE(ABORT, 'test write failure'); END;").unwrap();
        assert!(create_database(&mut db, "Rollback", Some("⭐"), None).is_err());
        let after = load(&mut db).unwrap();
        assert_eq!(after.databases.len(), count + 1);
        assert_eq!(after.views.len(), before.views.len() + 6);
        assert_eq!(
            serde_json::to_value(&after.records).unwrap(),
            serde_json::to_value(&before.records).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&after.views[..before.views.len()]).unwrap(),
            serde_json::to_value(&before.views).unwrap()
        );
    }

    #[test]
    fn font_preference_supports_auto_and_validates_input() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        assert!(set_font_family(&mut db, "Font").is_err());
        setup_workspace(&mut db, "Home", "#91baff").unwrap();
        assert_eq!(
            set_font_family(&mut db, "  Liberation Sans  ")
                .unwrap()
                .settings
                .unwrap()
                .font_family,
            "Liberation Sans"
        );
        for font in ["x".repeat(201), "Bad\nFont".into()] {
            assert!(set_font_family(&mut db, &font).is_err());
        }
        assert_eq!(
            load(&mut db).unwrap().settings.unwrap().font_family,
            "Liberation Sans"
        );
        assert_eq!(
            set_font_family(&mut db, "")
                .unwrap()
                .settings
                .unwrap()
                .font_family,
            ""
        );
    }

    #[test]
    fn legacy_workspace_is_cleared_once() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        db.execute_batch(include_str!("../migrations/001_workspace.sql"))
            .unwrap();
        db.execute_batch(include_str!("test_seed.sql")).unwrap();
        migrate(&mut db).unwrap();
        let workspace = load(&mut db).unwrap();
        assert!(workspace.settings.is_none());
        assert!(workspace.databases.is_empty());
        assert!(workspace.views.is_empty());
        assert!(workspace.records.is_empty());
        setup_workspace(&mut db, "Fresh start", "#8bd5b5").unwrap();
        create_database(&mut db, "Keep me", None, None).unwrap();
        migrate(&mut db).unwrap();
        let workspace = load(&mut db).unwrap();
        assert_eq!(workspace.settings.unwrap().name, "Fresh start");
        assert_eq!(workspace.databases[0].name, "Keep me");
    }
}
