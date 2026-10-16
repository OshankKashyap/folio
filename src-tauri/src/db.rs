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
    fn invalid(message: &'static str) -> Self {
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

    pub async fn run<F>(&self, operation: F) -> Result<Workspace, AppError>
    where
        F: FnOnce(&mut Connection) -> Result<Workspace, AppError> + Send + 'static,
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
    if version > 1 {
        return Err(rusqlite::Error::InvalidParameterName(
            "This workspace requires a newer version of Folio".into(),
        ));
    }
    if version == 0 {
        transaction.execute_batch(include_str!("../migrations/001_workspace.sql"))?;
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
pub struct Workspace {
    databases: Vec<WorkspaceDatabase>,
    pub views: Vec<SavedView>,
    pub records: Vec<Record>,
}

pub fn load(connection: &mut Connection) -> Result<Workspace, AppError> {
    let databases = connection
        .prepare("SELECT id, name, description, icon FROM databases ORDER BY position, id")?
        .query_map([], |row| {
            Ok(WorkspaceDatabase {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
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
        databases,
        views,
        records,
    })
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
        db
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
        db.pragma_update(None, "user_version", 2).unwrap();
        assert!(migrate(&mut db).is_err());
        let version: i64 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 2);
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
        let path = std::env::temp_dir().join(format!("folio-test-{}.sqlite", std::process::id()));
        {
            let mut db = Connection::open(&path).unwrap();
            migrate(&mut db).unwrap();
            create_record(&mut db, 3, "Done").unwrap();
            let mut view = load(&mut db).unwrap().views.remove(0);
            view.show_owner = false;
            update_view(&mut db, view).unwrap();
        }
        let mut db = Connection::open(&path).unwrap();
        migrate(&mut db).unwrap();
        let workspace = load(&mut db).unwrap();
        assert_eq!(workspace.records.len(), 11);
        assert!(!workspace.views[0].show_owner);
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
}
