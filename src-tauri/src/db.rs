use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};
use crate::columns::{Column, load_columns_full, load_record_values};

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

    pub(crate) fn missing() -> Self {
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
    pub fn minimize_to_tray(&self) -> Result<bool, AppError> {
        let mut connection = self.0.lock().map_err(|_| AppError {
            code: "storage_unavailable",
            message: "Storage is unavailable. Please restart Folio.",
        })?;
        get_minimize_to_tray(&mut connection)
    }

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
    if version > 11 {
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
    if version < 6 {
        transaction.execute_batch(include_str!("../migrations/006_sidebar_width.sql"))?;
    }
    if version < 7 {
        transaction.execute_batch(include_str!("../migrations/007_window_button_layout.sql"))?;
    }
    if version < 8 {
        transaction.execute_batch(include_str!("../migrations/008_minimize_to_tray.sql"))?;
    }
    if version < 9 {
        transaction.execute_batch(include_str!("../migrations/009_autostart.sql"))?;
    }
    if version < 10 {
        transaction.execute_batch(include_str!("../migrations/010_dynamic_columns.sql"))?;
    }
    if version < 11 {
        transaction.execute_batch(include_str!("../migrations/011_gpu_acceleration.sql"))?;
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
    pub values: HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordInput {
    pub id: i64,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    name: String,
    accent_color: String,
    font_family: String,
    sidebar_width: Option<i64>,
    window_button_layout: String,
    minimize_to_tray: bool,
    autostart: bool,
    gpu_acceleration: bool,
}

#[derive(Serialize)]
pub struct Workspace {
    settings: Option<WorkspaceSettings>,
    databases: Vec<WorkspaceDatabase>,
    pub columns: Vec<Column>,
    pub views: Vec<SavedView>,
    pub records: Vec<Record>,
}

pub fn load(connection: &mut Connection) -> Result<Workspace, AppError> {
    let settings = connection
        .query_row(
            "SELECT name, accent_color, font_family, sidebar_width, window_button_layout, minimize_to_tray, autostart, gpu_acceleration FROM workspace_settings WHERE id = 1",
            [],
            |row| {
                Ok(WorkspaceSettings {
                    name: row.get(0)?,
                    accent_color: row.get(1)?,
                    font_family: row.get(2)?,
                    sidebar_width: row.get(3)?,
                    window_button_layout: row.get(4)?,
                    minimize_to_tray: row.get(5)?,
                    autostart: row.get(6)?,
                    gpu_acceleration: row.get(7)?,
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
    let columns = load_columns_full(connection)?;
    let views = connection.prepare("SELECT id, database_id, name, layout, filter_active, sort_active, compact, show_owner FROM saved_views ORDER BY database_id, position, id")?
        .query_map([], |row| Ok(SavedView { id: row.get(0)?, database_id: row.get(1)?, name: row.get(2)?, layout: row.get(3)?, filter_active: row.get(4)?, sort_active: row.get(5)?, compact: row.get(6)?, show_owner: row.get(7)? }))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    // Load records without the old hardcoded columns
    let record_values_map = load_record_values(connection)?;
    let records = connection.prepare("SELECT id, database_id, name FROM records ORDER BY database_id, position, id")?
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            Ok((id, row.get(1)?, row.get(2)?))
        })?
        .collect::<rusqlite::Result<Vec<(i64, i64, String)>>>()?
        .into_iter()
        .map(|(id, database_id, name)| {
            let values: HashMap<String, String> = record_values_map
                .get(&id)
                .map(|m| m.iter().map(|(k, v)| (k.to_string(), v.clone())).collect())
                .unwrap_or_default();
            Record { id, database_id, name, values }
        })
        .collect();
    Ok(Workspace {
        settings,
        databases,
        columns,
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

pub fn set_sidebar_width(
    connection: &mut Connection,
    sidebar_width: Option<i64>,
) -> Result<Workspace, AppError> {
    if sidebar_width.is_some_and(|width| !(180..=4096).contains(&width)) {
        return Err(AppError::invalid(
            "Choose a sidebar width between 180 and 4096 pixels.",
        ));
    }
    if connection.execute(
        "UPDATE workspace_settings SET sidebar_width = ?1 WHERE id = 1",
        [sidebar_width],
    )? == 0
    {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn set_window_button_layout(
    connection: &mut Connection,
    window_button_layout: &str,
) -> Result<Workspace, AppError> {
    let window_button_layout = window_button_layout.trim();
    if !matches!(window_button_layout, "" | "left" | "right") {
        return Err(AppError::invalid(
            "Choose Auto, Left, or Right for window buttons.",
        ));
    }
    if connection.execute(
        "UPDATE workspace_settings SET window_button_layout = ?1 WHERE id = 1",
        [window_button_layout],
    )? == 0
    {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn get_minimize_to_tray(connection: &mut Connection) -> Result<bool, AppError> {
    Ok(connection
        .query_row(
            "SELECT minimize_to_tray FROM workspace_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(false))
}

pub fn set_minimize_to_tray(
    connection: &mut Connection,
    minimize_to_tray: bool,
) -> Result<Workspace, AppError> {
    if connection.execute(
        "UPDATE workspace_settings SET minimize_to_tray = ?1 WHERE id = 1",
        [minimize_to_tray],
    )? == 0
    {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn get_autostart(connection: &mut Connection) -> Result<bool, AppError> {
    Ok(connection
        .query_row(
            "SELECT autostart FROM workspace_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(false))
}

#[cfg(any(target_os = "linux", test))]
pub fn read_gpu_acceleration(path: &Path) -> rusqlite::Result<Option<bool>> {
    let connection = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    connection.busy_timeout(Duration::ZERO)?;
    connection.query_row(
        "SELECT gpu_acceleration FROM workspace_settings WHERE id = 1",
        [],
        |row| row.get(0),
    ).optional()
}

pub fn set_gpu_acceleration(
    connection: &mut Connection,
    gpu_acceleration: bool,
) -> Result<Workspace, AppError> {
    if connection.execute(
        "UPDATE workspace_settings SET gpu_acceleration = ?1 WHERE id = 1",
        [gpu_acceleration],
    )? == 0
    {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn set_autostart(connection: &mut Connection, autostart: bool) -> Result<Workspace, AppError> {
    if connection.execute(
        "UPDATE workspace_settings SET autostart = ?1 WHERE id = 1",
        [autostart],
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

pub fn create_record(
    connection: &mut Connection,
    database_id: i64,
) -> Result<Workspace, AppError> {
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
    connection.execute("INSERT INTO records (database_id, name, position) VALUES (?1, 'Untitled', (SELECT COALESCE(MAX(position), -1) + 1 FROM records WHERE database_id = ?1))", [database_id])?;
    load(connection)
}

pub fn update_record(
    connection: &mut Connection,
    input: RecordInput,
) -> Result<Workspace, AppError> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 500 {
        return Err(AppError::invalid(
            "A title is required (up to 500 characters).",
        ));
    }
    let changed = connection.execute("UPDATE records SET name = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2", params![name, input.id])?;
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

pub fn delete_records(connection: &mut Connection, record_ids: &[i64]) -> Result<usize, AppError> {
    if record_ids.is_empty() {
        return Ok(0);
    }
    let transaction = connection.transaction()?;
    let mut deleted = 0;
    {
        let mut statement = transaction.prepare("DELETE FROM records WHERE id = ?1")?;
        for id in record_ids {
            deleted += statement.execute([id])?;
        }
    }
    transaction.commit()?;
    Ok(deleted)
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
        // Seed after migration so records don't have old status/priority/due_date/owner columns
        db.execute_batch(include_str!("test_seed_v10.sql")).unwrap();
        db
    }

    fn workspace_snapshot(db: &Connection) -> Vec<Vec<Vec<rusqlite::types::Value>>> {
        // Exclude records.* since migration 010 drops status/priority/due_date/owner columns.
        // Snapshot the stable columns only.
        [
            ("workspace_settings", "id, name, accent_color, font_family"),
            ("databases", "*"),
            ("saved_views", "*"),
            ("records", "id, database_id, name, position, created_at, updated_at"),
        ]
        .map(|(table, columns)| {
            let mut statement = db
                .prepare(&format!("SELECT {columns} FROM {table} ORDER BY id"))
                .unwrap();
            let col_count = statement.column_count();
            statement
                .query_map([], |row| {
                    (0..col_count)
                        .map(|index| row.get(index))
                        .collect::<rusqlite::Result<Vec<_>>>()
                })
                .unwrap()
                .collect::<rusqlite::Result<Vec<_>>>()
                .unwrap()
        })
        .into()
    }

    #[test]
    fn batch_delete_cascades_values_and_pages() {
        let mut db = connection();
        for id in [1, 2, 3] {
            save_record_page(&mut db, id, "Filled page").unwrap();
        }
        assert_eq!(delete_records(&mut db, &[1, 2]).unwrap(), 2);
        assert_eq!(load(&mut db).unwrap().records.len(), 8);
        for table in ["records", "record_values", "record_pages"] {
            let count: i64 = db.query_row(
                &format!("SELECT count(*) FROM {table} WHERE {} IN (1, 2)", if table == "records" { "id" } else { "record_id" }),
                [], |row| row.get(0),
            ).unwrap();
            assert_eq!(count, 0, "{table}");
        }
        assert_eq!(get_record_page(&mut db, 3).unwrap(), "Filled page");
    }

    #[test]
    fn batch_delete_counts_only_existing_records() {
        let mut db = connection();
        assert_eq!(delete_records(&mut db, &[1, 999, 2, 1, -1]).unwrap(), 2);
        assert_eq!(load(&mut db).unwrap().records.len(), 8);
        assert_eq!(delete_records(&mut db, &[999]).unwrap(), 0);
    }

    #[test]
    fn empty_batch_delete_does_not_access_the_database() {
        let mut db = Connection::open_in_memory().unwrap();
        assert_eq!(delete_records(&mut db, &[]).unwrap(), 0);
        assert_eq!(db.total_changes(), 0);
    }

    #[test]
    fn batch_delete_failure_rolls_back_records_and_cascades() {
        let mut db = connection();
        save_record_page(&mut db, 1, "Keep page").unwrap();
        let before = workspace_snapshot(&db);
        let values_before: i64 = db.query_row("SELECT count(*) FROM record_values", [], |row| row.get(0)).unwrap();
        db.execute_batch("CREATE TEMP TRIGGER reject_delete BEFORE DELETE ON records WHEN OLD.id = 2 BEGIN SELECT RAISE(ABORT, 'test failure'); END;").unwrap();
        assert!(delete_records(&mut db, &[1, 2]).is_err());
        assert_eq!(workspace_snapshot(&db), before);
        let values_after: i64 = db.query_row("SELECT count(*) FROM record_values", [], |row| row.get(0)).unwrap();
        assert_eq!(values_after, values_before);
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "Keep page");
    }

    #[test]
    fn dynamic_values_validate_persist_clear_and_cascade() {
        use crate::columns::{self, ColumnOption, PropertyValue as V};
        let mut db = connection();
        let options = || Some(vec![ColumnOption { id: 1, label: "A".into(), emoji: "⭐".into(), color: "blue".into() }]);
        for (kind, valid, invalid) in [
            ("text", V::Text("hello".into()), V::Number(1.0)),
            ("number", V::Number(2.5), V::Number(f64::INFINITY)),
            ("select", V::Select(1), V::Select(99)),
            ("multiselect", V::Multi(vec![1]), V::Multi(vec![1, 99])),
            ("checkbox", V::Checkbox(true), V::Text("true".into())),
            ("status", V::Status(1), V::Select(1)),
            ("date", V::Date("2024-02-29".into()), V::Date("2026-02-29".into())),
        ] {
            let opts = if ["select", "multiselect", "status"].contains(&kind) { options() } else { None };
            let ws = columns::create_column(&mut db, 1, kind, kind, opts).unwrap();
            let col = ws.columns.iter().find(|col| col.name == kind).unwrap().id;
            columns::set_record_value(&mut db, 1, col, Some(valid.clone())).unwrap();
            let expected = serde_json::to_string(&valid).unwrap();
            assert_eq!(load(&mut db).unwrap().records[0].values[&col.to_string()], expected);
            assert!(columns::set_record_value(&mut db, 1, col, Some(invalid)).is_err());
            if kind != "text" {
                assert!(columns::set_record_value(&mut db, 1, col, Some(V::Text("wrong type".into()))).is_err());
            }
            if kind == "status" {
                assert!(columns::set_record_value(&mut db, 1, col, Some(V::Status(99))).is_err());
            }
            assert!(columns::set_record_value(&mut db, 7, col, Some(valid.clone())).is_err());
            assert!(columns::set_record_value(&mut db, 999, col, None).is_err());
            columns::set_record_value(&mut db, 1, col, None).unwrap();
            assert!(!load(&mut db).unwrap().records[0].values.contains_key(&col.to_string()));
            columns::set_record_value(&mut db, 1, col, Some(valid)).unwrap();
            columns::delete_column(&mut db, col).unwrap();
            assert_eq!(db.query_row("SELECT count(*) FROM record_values WHERE column_id = ?1", [col], |row| row.get::<_, i64>(0)).unwrap(), 0);
        }
        for date in ["1900-02-29", "2024-02-30", "+026-01-01", "2026-1-01"] {
            assert!(!columns::validate_iso_date(date));
        }
        let number = columns::create_column(&mut db, 1, "finite", "number", None).unwrap().columns.into_iter().find(|col| col.name == "finite").unwrap().id;
        assert!(columns::set_record_value(&mut db, 1, number, Some(V::Number(f64::NAN))).is_err());
        assert!(columns::set_record_value(&mut db, 1, number, Some(V::Number(f64::NEG_INFINITY))).is_err());
        assert!(columns::set_record_value(&mut db, 1, 999, None).is_err());
        assert!(columns::create_column(&mut db, 1, "Bad", "unknown", None).is_err());
        for kind in ["select", "multiselect", "status"] {
            assert!(columns::create_column(&mut db, 1, "Bad", kind, None).is_err());
            assert!(columns::create_column(&mut db, 1, "Empty options", kind, Some(vec![])).is_ok());
        }
        for kind in ["text", "number", "checkbox", "date"] {
            assert!(columns::create_column(&mut db, 1, "Bad", kind, options()).is_err());
        }
        assert!(columns::create_column(&mut db, 999, "Bad", "text", None).is_err());
        assert!(columns::create_column(&mut db, 1, " ", "text", None).is_err());
    }

    #[test]
    fn dynamic_option_replacement_preserves_ids_and_cleans_cells() {
        use crate::columns::{self, ColumnOption, PropertyValue as V};
        let mut db = connection();
        for kind in ["select", "status", "multiselect"] {
            let options: Vec<_> = (1..=3).map(|id| ColumnOption { id, label: format!("Option {id}"), emoji: "".into(), color: "gray".into() }).collect();
            let ws = columns::create_column(&mut db, 1, kind, kind, Some(options.clone())).unwrap();
            let col = ws.columns.iter().find(|col| col.name == kind).unwrap().id;
            let value = |ids: Vec<i64>| match kind {
                "select" => V::Select(ids[0]),
                "status" => V::Status(ids[0]),
                _ => V::Multi(ids),
            };
            columns::set_record_value(&mut db, 1, col, Some(value(vec![1]))).unwrap();
            columns::set_record_value(&mut db, 2, col, Some(value(vec![2, 3]))).unwrap();
            columns::set_record_value(&mut db, 3, col, Some(value(vec![3]))).unwrap();
            let mut retained = options[1..].to_vec();
            retained[0].label = "Renamed".into();
            let ws = columns::set_column_options(&mut db, col, retained.clone()).unwrap();
            assert!(!ws.records[0].values.contains_key(&col.to_string()));
            assert_eq!(ws.records[1].values[&col.to_string()], serde_json::to_string(&value(vec![2, 3])).unwrap());
            assert_eq!(ws.columns.iter().find(|item| item.id == col).unwrap().options.as_ref().unwrap()[0].id, 2);
            let ws = columns::set_column_options(&mut db, col, vec![retained[1].clone()]).unwrap();
            if kind == "multiselect" {
                assert_eq!(ws.records[1].values[&col.to_string()], r#"{"Multi":[3]}"#);
            } else {
                assert!(!ws.records[1].values.contains_key(&col.to_string()));
            }
            assert_eq!(ws.records[2].values[&col.to_string()], serde_json::to_string(&value(vec![3])).unwrap());
            assert!(columns::set_column_options(&mut db, col, vec![retained[0].clone(), retained[0].clone()]).is_err());
            let (new_id, ws) = columns::add_inline_option(&mut db, col, " Inline ").unwrap();
            assert_eq!(new_id, 4);
            let option = ws.columns.iter().find(|item| item.id == col).unwrap().options.as_ref().unwrap().last().unwrap();
            assert_eq!(option.label, "Inline");
            assert_eq!(option.color, "brown");
            columns::set_column_options(&mut db, col, vec![]).unwrap();
            assert_eq!(db.query_row("SELECT count(*) FROM record_values WHERE column_id = ?1", [col], |row| row.get::<_, i64>(0)).unwrap(), 0);
            columns::rename_column(&mut db, col, " Renamed column ").unwrap();
            assert_eq!(load(&mut db).unwrap().columns.iter().find(|item| item.id == col).unwrap().name, "Renamed column");
        }
    }

    #[test]
    fn dynamic_migration_preserves_all_old_property_values_and_is_idempotent() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        for migration in [
            include_str!("../migrations/001_workspace.sql"),
            include_str!("../migrations/002_workspace_setup.sql"),
            include_str!("../migrations/003_interface_font.sql"),
            include_str!("../migrations/004_database_icons.sql"),
            include_str!("../migrations/005_record_pages.sql"),
            include_str!("../migrations/006_sidebar_width.sql"),
            include_str!("../migrations/007_window_button_layout.sql"),
            include_str!("../migrations/008_minimize_to_tray.sql"),
            include_str!("../migrations/009_autostart.sql"),
            include_str!("test_seed.sql"),
        ] { db.execute_batch(migration).unwrap(); }
        db.execute("UPDATE records SET owner = ?1, due_date = '2024-02-29' WHERE id = 1", ["Oshank \"quoted\" 🦀\nsecond line"]).unwrap();
        db.execute("UPDATE records SET due_date = NULL, owner = '' WHERE id = 10", []).unwrap();
        let old: Vec<(i64, i64, String, String, Option<String>, String)> = db.prepare("SELECT id, database_id, status, priority, due_date, owner FROM records ORDER BY id").unwrap().query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))).unwrap().collect::<rusqlite::Result<_>>().unwrap();
        let stable = workspace_snapshot(&db);
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), stable);
        let workspace = load(&mut db).unwrap();
        assert_eq!(workspace.columns.len(), 12);
        for (id, database_id, status, priority, due_date, owner) in old {
            let record = workspace.records.iter().find(|record| record.id == id).unwrap();
            for (name, kind, expected) in [
                ("Status", "status", Some(serde_json::json!({"Status": match status.as_str() { "To do" => 1, "In progress" => 2, "Done" => 3, _ => unreachable!() }}))),
                ("Priority", "select", Some(serde_json::json!({"Select": match priority.as_str() { "High" => 1, "Medium" => 2, "Low" => 3, _ => unreachable!() }}))),
                ("Due date", "date", due_date.map(|value| serde_json::json!({"Date": value}))),
                ("Owner", "text", if owner.is_empty() { None } else { Some(serde_json::json!({"Text": owner})) }),
            ] {
                let col = workspace.columns.iter().find(|col| col.database_id == database_id && col.name == name).unwrap();
                assert_eq!(col.col_type, kind);
                let actual = record.values.get(&col.id.to_string()).map(|json| serde_json::from_str::<serde_json::Value>(json).unwrap());
                assert_eq!(actual, expected, "record {id}, {name}");
                if kind == "status" || kind == "select" {
                    let options = col.options.as_ref().unwrap();
                    let labels = if kind == "status" { ["To do", "In progress", "Done"] } else { ["High", "Medium", "Low"] };
                    let colors = if kind == "status" { ["gray", "blue", "green"] } else { ["red", "orange", "gray"] };
                    for (index, option) in options.iter().enumerate() {
                        assert_eq!(option.id, index as i64 + 1);
                        assert_eq!(option.label, labels[index]);
                        assert_eq!(option.color, colors[index]);
                        assert_eq!(option.emoji, "");
                    }
                    assert_eq!(options.len(), 3);
                }
            }
        }
        let fields: Vec<String> = db.prepare("PRAGMA table_info(records)").unwrap().query_map([], |row| row.get(1)).unwrap().collect::<rusqlite::Result<_>>().unwrap();
        for old in ["status", "priority", "due_date", "owner"] { assert!(!fields.iter().any(|field| field == old)); }
        assert_eq!(db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)).unwrap(), 11);
        let before = serde_json::to_value(workspace).unwrap();
        migrate(&mut db).unwrap();
        assert_eq!(serde_json::to_value(load(&mut db).unwrap()).unwrap(), before);
    }

    #[test]
    fn sidebar_migration_is_additive_and_guard_accepts_its_version() {
        let mut db = Connection::open_in_memory().unwrap();
        for migration in [
            include_str!("../migrations/001_workspace.sql"),
            include_str!("../migrations/002_workspace_setup.sql"),
            include_str!("../migrations/003_interface_font.sql"),
            include_str!("../migrations/004_database_icons.sql"),
            include_str!("../migrations/005_record_pages.sql"),
            include_str!("test_seed.sql"),
        ] {
            db.execute_batch(migration).unwrap();
        }
        db.execute("INSERT INTO workspace_settings (id, name, accent_color, font_family) VALUES (1, 'Keep me', '#91baff', 'Installed Font')", []).unwrap();
        save_record_page(&mut db, 1, "Keep these notes").unwrap();
        let before = workspace_snapshot(&db);
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), before);
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "Keep these notes");
        assert_eq!(load(&mut db).unwrap().settings.unwrap().sidebar_width, None);
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            11
        );
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), before);
    }

    #[test]
    fn window_button_migration_is_additive_and_guard_accepts_its_version() {
        let mut db = Connection::open_in_memory().unwrap();
        for migration in [
            include_str!("../migrations/001_workspace.sql"),
            include_str!("../migrations/002_workspace_setup.sql"),
            include_str!("../migrations/003_interface_font.sql"),
            include_str!("../migrations/004_database_icons.sql"),
            include_str!("../migrations/005_record_pages.sql"),
            include_str!("../migrations/006_sidebar_width.sql"),
            include_str!("test_seed.sql"),
        ] {
            db.execute_batch(migration).unwrap();
        }
        db.execute("INSERT INTO workspace_settings (id, name, accent_color, font_family, sidebar_width) VALUES (1, 'Keep me', '#91baff', 'Installed Font', 280)", []).unwrap();
        save_record_page(&mut db, 1, "Keep these notes").unwrap();
        let before = workspace_snapshot(&db);
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), before);
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "Keep these notes");
        let settings = load(&mut db).unwrap().settings.unwrap();
        assert_eq!(settings.sidebar_width, Some(280));
        assert_eq!(settings.window_button_layout, "");
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            11
        );
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), before);
    }

    #[test]
    fn tray_migration_is_additive_and_guard_accepts_its_version() {
        let mut db = Connection::open_in_memory().unwrap();
        for migration in [
            include_str!("../migrations/001_workspace.sql"),
            include_str!("../migrations/002_workspace_setup.sql"),
            include_str!("../migrations/003_interface_font.sql"),
            include_str!("../migrations/004_database_icons.sql"),
            include_str!("../migrations/005_record_pages.sql"),
            include_str!("../migrations/006_sidebar_width.sql"),
            include_str!("../migrations/007_window_button_layout.sql"),
            include_str!("test_seed.sql"),
        ] {
            db.execute_batch(migration).unwrap();
        }
        db.execute("INSERT INTO workspace_settings (id, name, accent_color, font_family, sidebar_width, window_button_layout) VALUES (1, 'Keep me', '#91baff', 'Installed Font', 280, 'left')", []).unwrap();
        save_record_page(&mut db, 1, "Keep these notes").unwrap();
        let before = workspace_snapshot(&db);
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), before);
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "Keep these notes");
        let settings = load(&mut db).unwrap().settings.unwrap();
        assert_eq!(settings.sidebar_width, Some(280));
        assert_eq!(settings.window_button_layout, "left");
        assert!(!settings.minimize_to_tray);
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            11
        );
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), before);
    }

    #[test]
    fn minimize_to_tray_round_trips_and_defaults_to_false() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        assert!(!get_minimize_to_tray(&mut db).unwrap());
        assert_eq!(
            set_minimize_to_tray(&mut db, true).err().unwrap().code,
            "not_found"
        );
        let workspace = setup_workspace(&mut db, "Home", "#91baff").unwrap();
        assert!(!workspace.settings.unwrap().minimize_to_tray);
        for enabled in [true, false] {
            let workspace = set_minimize_to_tray(&mut db, enabled).unwrap();
            assert_eq!(
                serde_json::to_value(workspace).unwrap()["settings"]["minimizeToTray"],
                enabled
            );
            assert_eq!(get_minimize_to_tray(&mut db).unwrap(), enabled);
            assert_eq!(
                load(&mut db).unwrap().settings.unwrap().minimize_to_tray,
                enabled
            );
        }
    }

    #[test]
    fn autostart_migration_is_additive_and_guard_accepts_its_version() {
        let mut db = Connection::open_in_memory().unwrap();
        for migration in [
            include_str!("../migrations/001_workspace.sql"),
            include_str!("../migrations/002_workspace_setup.sql"),
            include_str!("../migrations/003_interface_font.sql"),
            include_str!("../migrations/004_database_icons.sql"),
            include_str!("../migrations/005_record_pages.sql"),
            include_str!("../migrations/006_sidebar_width.sql"),
            include_str!("../migrations/007_window_button_layout.sql"),
            include_str!("../migrations/008_minimize_to_tray.sql"),
            include_str!("test_seed.sql"),
        ] {
            db.execute_batch(migration).unwrap();
        }
        db.execute("INSERT INTO workspace_settings (id, name, accent_color, font_family, sidebar_width, window_button_layout, minimize_to_tray) VALUES (1, 'Keep me', '#91baff', 'Installed Font', 280, 'left', 1)", []).unwrap();
        save_record_page(&mut db, 1, "Keep these notes").unwrap();
        let before = workspace_snapshot(&db);
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), before);
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "Keep these notes");
        let settings = load(&mut db).unwrap().settings.unwrap();
        assert_eq!(settings.sidebar_width, Some(280));
        assert_eq!(settings.window_button_layout, "left");
        assert!(settings.minimize_to_tray);
        assert!(!settings.autostart);
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            11
        );
        migrate(&mut db).unwrap();
        assert_eq!(workspace_snapshot(&db), before);
    }

    #[test]
    fn gpu_migration_is_additive_and_guard_agrees() {
        let mut db = connection();
        setup_workspace(&mut db, "Keep me", "#91baff").unwrap();
        set_autostart(&mut db, true).unwrap();
        save_record_page(&mut db, 1, "Keep these notes").unwrap();
        let before = serde_json::to_value(load(&mut db).unwrap()).unwrap();
        // Reconstruct the version-10 schema with populated workspace/column/record tables.
        db.execute_batch("ALTER TABLE workspace_settings DROP COLUMN gpu_acceleration; PRAGMA user_version = 10;").unwrap();
        migrate(&mut db).unwrap();
        assert_eq!(serde_json::to_value(load(&mut db).unwrap()).unwrap(), before);
        assert_eq!(get_record_page(&mut db, 1).unwrap(), "Keep these notes");
        assert_eq!(db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)).unwrap(), 11);
        migrate(&mut db).unwrap(); // The migration's version must also pass the startup guard.
        assert_eq!(serde_json::to_value(load(&mut db).unwrap()).unwrap(), before);
    }

    #[test]
    fn gpu_acceleration_round_trips_and_defaults_to_true() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        assert_eq!(set_gpu_acceleration(&mut db, false).err().unwrap().code, "not_found");
        assert!(setup_workspace(&mut db, "Home", "#91baff").unwrap().settings.unwrap().gpu_acceleration);
        for enabled in [false, true] {
            let workspace = set_gpu_acceleration(&mut db, enabled).unwrap();
            assert_eq!(serde_json::to_value(workspace).unwrap()["settings"]["gpuAcceleration"], enabled);
            assert_eq!(load(&mut db).unwrap().settings.unwrap().gpu_acceleration, enabled);
        }
    }

    #[test]
    fn early_gpu_read_is_read_only_and_handles_missing_storage() {
        let path = std::env::temp_dir().join(format!("folio-gpu-test-{}.sqlite", std::process::id()));
        assert!(!path.exists());
        assert!(read_gpu_acceleration(&path).is_err());
        assert!(!path.exists());
        {
            let mut db = Connection::open(&path).unwrap();
            assert!(read_gpu_acceleration(&path).is_err()); // Missing table.
            migrate(&mut db).unwrap();
            assert_eq!(read_gpu_acceleration(&path).unwrap(), None);
            setup_workspace(&mut db, "Home", "#91baff").unwrap();
            for enabled in [false, true] {
                set_gpu_acceleration(&mut db, enabled).unwrap();
                assert_eq!(read_gpu_acceleration(&path).unwrap(), Some(enabled));
            }
            db.execute_batch("ALTER TABLE workspace_settings DROP COLUMN gpu_acceleration; PRAGMA user_version = 10;").unwrap();
            assert!(read_gpu_acceleration(&path).is_err()); // Unmigrated workspace.
            assert_eq!(db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)).unwrap(), 10);
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn autostart_round_trips_and_defaults_to_false() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        assert!(!get_autostart(&mut db).unwrap());
        assert_eq!(
            set_autostart(&mut db, true).err().unwrap().code,
            "not_found"
        );
        let workspace = setup_workspace(&mut db, "Home", "#91baff").unwrap();
        assert!(!workspace.settings.unwrap().autostart);
        for enabled in [true, false] {
            let workspace = set_autostart(&mut db, enabled).unwrap();
            assert_eq!(
                serde_json::to_value(workspace).unwrap()["settings"]["autostart"],
                enabled
            );
            assert_eq!(get_autostart(&mut db).unwrap(), enabled);
            assert_eq!(load(&mut db).unwrap().settings.unwrap().autostart, enabled);
        }
    }

    #[test]
    fn window_button_layout_round_trips_and_validates_input() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        assert_eq!(
            set_window_button_layout(&mut db, "left").err().unwrap().code,
            "not_found"
        );
        setup_workspace(&mut db, "Home", "#91baff").unwrap();
        for layout in ["", "left", "right", "  left  ", "  "] {
            let workspace = set_window_button_layout(&mut db, layout).unwrap();
            assert_eq!(
                serde_json::to_value(workspace).unwrap()["settings"]["windowButtonLayout"],
                layout.trim()
            );
            assert_eq!(
                load(&mut db).unwrap().settings.unwrap().window_button_layout,
                layout.trim()
            );
        }
        for layout in ["Left", "auto", "center", "garbage", "left\0", "right left"] {
            assert_eq!(
                set_window_button_layout(&mut db, layout).err().unwrap().code,
                "invalid_input"
            );
        }
        assert_eq!(
            load(&mut db).unwrap().settings.unwrap().window_button_layout,
            ""
        );
    }

    #[test]
    fn sidebar_width_round_trips_resets_and_validates_input() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        assert_eq!(
            set_sidebar_width(&mut db, Some(210)).err().unwrap().code,
            "not_found"
        );
        setup_workspace(&mut db, "Home", "#91baff").unwrap();
        for width in [180, 280, 4096] {
            let workspace = set_sidebar_width(&mut db, Some(width)).unwrap();
            assert_eq!(workspace.settings.unwrap().sidebar_width, Some(width));
            assert_eq!(
                load(&mut db).unwrap().settings.unwrap().sidebar_width,
                Some(width)
            );
        }
        for width in [i64::MIN, -1, 0, 179, 4097, i64::MAX] {
            assert_eq!(
                set_sidebar_width(&mut db, Some(width)).err().unwrap().code,
                "invalid_input"
            );
        }
        assert_eq!(
            load(&mut db).unwrap().settings.unwrap().sidebar_width,
            Some(4096)
        );
        let workspace = set_sidebar_width(&mut db, None).unwrap();
        assert_eq!(
            serde_json::to_value(workspace).unwrap()["settings"]["sidebarWidth"],
            serde_json::Value::Null
        );
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
            let before = workspace_snapshot(&db);
            migrate(&mut db).unwrap();
            assert_eq!(workspace_snapshot(&db), before);
            assert_eq!(
                db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                    .unwrap(),
                11
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
        // Version 12 is one beyond the current maximum of 11 → must be rejected.
        db.pragma_update(None, "user_version", 12).unwrap();
        assert!(migrate(&mut db).is_err());
        let version: i64 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 12);
    }

    #[test]
    fn records_support_create_update_delete_and_validation() {
        let mut db = connection();
        let workspace = create_record(&mut db, 2).unwrap();
        let id = workspace
            .records
            .iter()
            .map(|record| record.id)
            .max()
            .unwrap();
        let input = |name: &str| RecordInput {
            id,
            name: name.into(),
        };
        // Name validation
        assert!(update_record(&mut db, input("")).is_err());
        let workspace = update_record(&mut db, input(" A real book ")).unwrap();
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
        assert!(create_record(&mut db, 999).is_err());
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
            set_sidebar_width(&mut db, Some(280)).unwrap();
            set_window_button_layout(&mut db, "left").unwrap();
            set_minimize_to_tray(&mut db, true).unwrap();
            let workspace = create_database(
                &mut db,
                "Tasks",
                Some("🚀"),
                Some("data:image/png;base64,AAAA"),
            )
            .unwrap();
            let database_id = workspace.databases[0].id;
            let workspace = create_record(&mut db, database_id).unwrap();
            let record_id = workspace.records[0].id;
            let workspace = crate::columns::create_column(&mut db, database_id, "Notes", "text", None).unwrap();
            let column_id = workspace.columns[0].id;
            crate::columns::set_record_value(&mut db, record_id, column_id, Some(crate::columns::PropertyValue::Text("Persistent value".into()))).unwrap();
            let mut view = load(&mut db).unwrap().views.remove(0);
            view.show_owner = false;
            update_view(&mut db, view).unwrap();
        }
        let mut db = Connection::open(&path).unwrap();
        migrate(&mut db).unwrap();
        let workspace = load(&mut db).unwrap();
        assert_eq!(workspace.records.len(), 1);
        assert_eq!(workspace.columns[0].name, "Notes");
        assert_eq!(workspace.records[0].values[&workspace.columns[0].id.to_string()], r#"{"Text":"Persistent value"}"#);
        assert_eq!(workspace.databases[0].emoji, "🚀");
        assert_eq!(
            workspace.databases[0].custom_icon.as_deref(),
            Some("data:image/png;base64,AAAA")
        );
        let settings = workspace.settings.unwrap();
        assert_eq!(settings.name, "My workspace");
        assert_eq!(settings.accent_color, "#91baff");
        assert_eq!(settings.font_family, "Liberation Sans");
        assert_eq!(settings.sidebar_width, Some(280));
        assert_eq!(settings.window_button_layout, "left");
        assert!(settings.minimize_to_tray);
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
        assert!(!settings.minimize_to_tray);
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
                ("records", "id, database_id, name, position, created_at, updated_at"),
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
            11
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
