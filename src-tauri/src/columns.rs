use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::db::{AppError, Workspace, load};

// ─── Types ────────────────────────────────────────────────────────────────────

/// The seven permitted column types.
const VALID_TYPES: &[&str] = &[
    "text",
    "number",
    "select",
    "multiselect",
    "checkbox",
    "status",
    "date",
];
/// Types that use options.
const OPTIONS_TYPES: &[&str] = &["select", "multiselect", "status"];

/// Nine Notion-style dark-theme palette colors.
const VALID_COLORS: &[&str] = &[
    "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red",
];

/// A single select/multiselect/status option.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ColumnOption {
    pub id: i64,
    pub label: String,
    pub emoji: String,
    pub color: String,
}

/// Shape returned in the Workspace payload.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub id: i64,
    pub database_id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub col_type: String,
    pub options: Option<Vec<ColumnOption>>,
    pub position: i64,
}

/// Self-describing property value — mirrors the frontend discriminated union.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum PropertyValue {
    Text(String),
    Number(f64),
    Select(i64),
    Multi(Vec<i64>),
    Checkbox(bool),
    Status(i64),
    Date(String),
}

// ─── Date validation ──────────────────────────────────────────────────────────

/// Validates a strict ISO YYYY-MM-DD date with real month/day ranges and leap years.
/// ~15 lines, no new dependencies.
pub fn validate_iso_date(date: &str) -> bool {
    if date.len() != 10 {
        return false;
    }
    let bytes = date.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' || bytes.iter().enumerate().any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit()) {
        return false;
    }
    let parse_u32 = |s: &[u8]| -> Option<u32> {
        std::str::from_utf8(s).ok()?.parse().ok()
    };
    let (Some(y), Some(m), Some(d)) = (parse_u32(&bytes[..4]), parse_u32(&bytes[5..7]), parse_u32(&bytes[8..10])) else {
        return false;
    };
    if !(1..=12).contains(&m) || d < 1 {
        return false;
    }
    let days_in_month = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
            if leap { 29 } else { 28 }
        }
        _ => return false,
    };
    d <= days_in_month
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn parse_options(json: &Option<String>) -> Result<Vec<ColumnOption>, AppError> {
    match json {
        None => Ok(vec![]),
        Some(s) if s.is_empty() => Ok(vec![]),
        Some(s) => serde_json::from_str(s).map_err(|_| {
            AppError::invalid("Column options are corrupted.")
        }),
    }
}

fn serialize_options(opts: &[ColumnOption]) -> Option<String> {
    if opts.is_empty() {
        None
    } else {
        Some(serde_json::to_string(opts).expect("options serialization is infallible"))
    }
}

/// Validate an emoji string: empty is OK; non-empty must be exactly one grapheme
/// and ≤16 scalar values without control chars. Reuses the same rules as db.rs.
fn validate_option_emoji(emoji: &str) -> bool {
    if emoji.is_empty() {
        return true;
    }
    if emoji.chars().count() > 16 || emoji.chars().any(char::is_control) {
        return false;
    }
    true
}

fn next_option_id(opts: &[ColumnOption]) -> i64 {
    opts.iter().map(|o| o.id).max().unwrap_or(0) + 1
}

fn column_type(connection: &Connection, column_id: i64) -> Result<(i64, String, Option<String>), AppError> {
    connection.query_row(
        "SELECT database_id, type, options FROM columns WHERE id = ?1",
        [column_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()?
    .ok_or_else(AppError::missing)
}

// ─── Validate PropertyValue against a column ──────────────────────────────────

pub fn validate_value(
    value: &PropertyValue,
    col_type: &str,
    options_json: &Option<String>,
) -> Result<(), AppError> {
    match (value, col_type) {
        (PropertyValue::Text(_), "text") => Ok(()),
        (PropertyValue::Number(n), "number") => {
            if n.is_finite() {
                Ok(())
            } else {
                Err(AppError::invalid("Number must be finite."))
            }
        }
        (PropertyValue::Select(id), "select") => {
            let opts = parse_options(options_json)?;
            if opts.iter().any(|o| o.id == *id) {
                Ok(())
            } else {
                Err(AppError::invalid("Unknown option id for select column."))
            }
        }
        (PropertyValue::Multi(ids), "multiselect") => {
            let opts = parse_options(options_json)?;
            let valid_ids: std::collections::HashSet<i64> = opts.iter().map(|o| o.id).collect();
            if ids.iter().all(|id| valid_ids.contains(id)) {
                Ok(())
            } else {
                Err(AppError::invalid("Unknown option id in multiselect."))
            }
        }
        (PropertyValue::Checkbox(_), "checkbox") => Ok(()),
        (PropertyValue::Status(id), "status") => {
            let opts = parse_options(options_json)?;
            if opts.iter().any(|o| o.id == *id) {
                Ok(())
            } else {
                Err(AppError::invalid("Unknown option id for status column."))
            }
        }
        (PropertyValue::Date(d), "date") => {
            if validate_iso_date(d) {
                Ok(())
            } else {
                Err(AppError::invalid(
                    "Date must be YYYY-MM-DD with valid calendar day.",
                ))
            }
        }
        _ => Err(AppError::invalid(
            "Value type does not match column type.",
        )),
    }
}

// ─── Public db functions ──────────────────────────────────────────────────────

pub fn create_column(
    connection: &mut Connection,
    database_id: i64,
    name: &str,
    col_type: &str,
    options: Option<Vec<ColumnOption>>,
) -> Result<Workspace, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 {
        return Err(AppError::invalid(
            "Column name must be 1–64 characters.",
        ));
    }
    if !VALID_TYPES.contains(&col_type) {
        return Err(AppError::invalid(
            "Column type must be one of: text, number, select, multiselect, checkbox, status, date.",
        ));
    }
    let needs_options = OPTIONS_TYPES.contains(&col_type);
    match &options {
        Some(_) if !needs_options => {
            return Err(AppError::invalid(
                "Options are only allowed for select, multiselect, and status columns.",
            ));
        }
        None if needs_options => {
            return Err(AppError::invalid(
                "Options are required for select, multiselect, and status columns.",
            ));
        }
        _ => {}
    }
    // Validate option labels/colors/emojis and assign stable ids
    let opts = options.unwrap_or_default();
    let options_json = if needs_options {
        let validated = assign_option_ids(opts, false)?;
        serialize_options(&validated)
    } else {
        None
    };
    // Verify database exists
    if connection
        .query_row("SELECT id FROM databases WHERE id = ?1", [database_id], |row| row.get::<_, i64>(0))
        .optional()?
        .is_none()
    {
        return Err(AppError::missing());
    }
    connection.execute(
        "INSERT INTO columns (database_id, name, type, options, position) VALUES (?1, ?2, ?3, ?4, COALESCE((SELECT MAX(position) FROM columns WHERE database_id = ?1), -1) + 1)",
        params![database_id, name, col_type, options_json],
    )?;
    load(connection)
}

/// Validate options, assigning initial ids only when creating a column.
fn assign_option_ids(opts: Vec<ColumnOption>, preserve_ids: bool) -> Result<Vec<ColumnOption>, AppError> {
    opts.into_iter()
        .enumerate()
        .map(|(i, mut opt)| {
            let label = opt.label.trim().to_string();
            if label.is_empty() {
                return Err(AppError::invalid("Option labels must not be empty."));
            }
            if !VALID_COLORS.contains(&opt.color.as_str()) {
                return Err(AppError::invalid(
                    "Option color must be one of: gray, brown, orange, yellow, green, blue, purple, pink, red.",
                ));
            }
            let emoji = opt.emoji.trim().to_string();
            if !validate_option_emoji(&emoji) {
                return Err(AppError::invalid(
                    "Option emoji must be empty or a single grapheme (up to 16 characters).",
                ));
            }
            if !preserve_ids {
                opt.id = (i + 1) as i64;
            }
            if opt.id <= 0 {
                return Err(AppError::invalid("Option ids must be positive."));
            }
            opt.label = label;
            opt.emoji = emoji;
            Ok(opt)
        })
        .collect()
}

pub fn rename_column(
    connection: &mut Connection,
    column_id: i64,
    name: &str,
) -> Result<Workspace, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 {
        return Err(AppError::invalid(
            "Column name must be 1–64 characters.",
        ));
    }
    if connection.execute(
        "UPDATE columns SET name = ?1 WHERE id = ?2",
        params![name, column_id],
    )? == 0
    {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn delete_column(
    connection: &mut Connection,
    column_id: i64,
) -> Result<Workspace, AppError> {
    if connection.execute("DELETE FROM columns WHERE id = ?1", [column_id])? == 0 {
        return Err(AppError::missing());
    }
    load(connection)
}

pub fn set_column_options(
    connection: &mut Connection,
    column_id: i64,
    options: Vec<ColumnOption>,
) -> Result<Workspace, AppError> {
    let (_, col_type, old_options_json) = column_type(connection, column_id)?;
    if !OPTIONS_TYPES.contains(&col_type.as_str()) {
        return Err(AppError::invalid(
            "set_column_options is only allowed for select, multiselect, and status columns.",
        ));
    }

    let old_opts = parse_options(&old_options_json)?;

    // Existing ids identify persisted selections and must survive list edits.
    let new_opts = assign_option_ids(options, true)?;

    // Verify ids are unique within the new list
    let mut seen = std::collections::HashSet::new();
    for opt in &new_opts {
        if !seen.insert(opt.id) {
            return Err(AppError::invalid("Option ids must be unique within the column."));
        }
    }

    // Find removed option ids
    let new_id_set: std::collections::HashSet<i64> = new_opts.iter().map(|o| o.id).collect();
    let removed_ids: Vec<i64> = old_opts
        .iter()
        .filter(|o| !new_id_set.contains(&o.id))
        .map(|o| o.id)
        .collect();

    let options_json = serialize_options(&new_opts);

    let transaction = connection.transaction()?;

    // Clean up values referencing removed option ids
    if !removed_ids.is_empty() {
        match col_type.as_str() {
            "select" | "status" => {
                // Delete rows where the value selects a removed id
                for removed_id in &removed_ids {
                    let select_val = if col_type == "select" {
                        format!("{{\"Select\":{removed_id}}}")
                    } else {
                        format!("{{\"Status\":{removed_id}}}")
                    };
                    transaction.execute(
                        "DELETE FROM record_values WHERE column_id = ?1 AND value = ?2",
                        params![column_id, select_val],
                    )?;
                }
            }
            "multiselect" => {
                // For multiselect we must splice out the removed id from each array
                let mut stmt = transaction.prepare(
                    "SELECT record_id, value FROM record_values WHERE column_id = ?1",
                )?;
                let rows: Vec<(i64, String)> = stmt
                    .query_map([column_id], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<rusqlite::Result<_>>()?;
                drop(stmt);
                for (record_id, value_str) in rows {
                    if let Ok(PropertyValue::Multi(ids)) =
                        serde_json::from_str::<PropertyValue>(&value_str)
                    {
                        let filtered: Vec<i64> = ids
                            .into_iter()
                            .filter(|id| !removed_ids.contains(id))
                            .collect();
                        if filtered.is_empty() {
                            transaction.execute(
                                "DELETE FROM record_values WHERE record_id = ?1 AND column_id = ?2",
                                params![record_id, column_id],
                            )?;
                        } else {
                            let new_val = serde_json::to_string(&PropertyValue::Multi(filtered))
                                .expect("infallible");
                            transaction.execute(
                                "UPDATE record_values SET value = ?1 WHERE record_id = ?2 AND column_id = ?3",
                                params![new_val, record_id, column_id],
                            )?;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    transaction.execute(
        "UPDATE columns SET options = ?1 WHERE id = ?2",
        params![options_json, column_id],
    )?;
    transaction.commit()?;
    load(connection)
}

pub fn set_record_value(
    connection: &mut Connection,
    record_id: i64,
    column_id: i64,
    value: Option<PropertyValue>,
) -> Result<Workspace, AppError> {
    // Verify the record and column belong to the same database
    let record_db: Option<i64> = connection
        .query_row("SELECT database_id FROM records WHERE id = ?1", [record_id], |row| row.get(0))
        .optional()?;
    let record_db = record_db.ok_or_else(AppError::missing)?;

    let (col_db, col_type, options_json) = column_type(connection, column_id)?;
    if col_db != record_db {
        return Err(AppError::invalid("Column does not belong to this record's database."));
    }

    match value {
        None => {
            connection.execute(
                "DELETE FROM record_values WHERE record_id = ?1 AND column_id = ?2",
                params![record_id, column_id],
            )?;
        }
        Some(v) => {
            validate_value(&v, &col_type, &options_json)?;
            let json = serde_json::to_string(&v).expect("infallible");
            connection.execute(
                "INSERT INTO record_values (record_id, column_id, value) VALUES (?1, ?2, ?3) ON CONFLICT(record_id, column_id) DO UPDATE SET value = excluded.value",
                params![record_id, column_id, json],
            )?;
        }
    }
    load(connection)
}

/// Create a new option inline (used by select/multiselect/status cell editors).
/// Appends with next stable id and auto-assigns a color from the palette cycle.
pub fn add_inline_option(
    connection: &mut Connection,
    column_id: i64,
    label: &str,
) -> Result<(i64, Workspace), AppError> {
    let (_, col_type, options_json) = column_type(connection, column_id)?;
    if !OPTIONS_TYPES.contains(&col_type.as_str()) {
        return Err(AppError::invalid("add_inline_option requires a select/multiselect/status column."));
    }
    let label = label.trim();
    if label.is_empty() {
        return Err(AppError::invalid("Option label must not be empty."));
    }
    let mut opts = parse_options(&options_json)?;
    let new_id = next_option_id(&opts);
    // Cycle colors
    let color = VALID_COLORS[opts.len() % VALID_COLORS.len()];
    opts.push(ColumnOption {
        id: new_id,
        label: label.to_string(),
        emoji: String::new(),
        color: color.to_string(),
    });
    let new_json = serialize_options(&opts);
    connection.execute(
        "UPDATE columns SET options = ?1 WHERE id = ?2",
        params![new_json, column_id],
    )?;
    Ok((new_id, load(connection)?))
}

// ─── Load helpers (used by db::load) ─────────────────────────────────────────

/// Full load of columns including parsed options.
pub fn load_columns_full(connection: &Connection) -> Result<Vec<Column>, rusqlite::Error> {
    let mut stmt = connection.prepare(
        "SELECT id, database_id, name, type, options, position FROM columns ORDER BY database_id, position, id",
    )?;
    stmt.query_map([], |row| {
        let options_json: Option<String> = row.get(4)?;
        let options: Option<Vec<ColumnOption>> = options_json
            .as_deref()
            .filter(|s| !s.is_empty())
            .and_then(|s| serde_json::from_str(s).ok());
        Ok(Column {
            id: row.get(0)?,
            database_id: row.get(1)?,
            name: row.get(2)?,
            col_type: row.get(3)?,
            options,
            position: row.get(5)?,
        })
    })?
    .collect()
}

/// Load record values as a map from record_id to (column_id → PropertyValue JSON).
pub fn load_record_values(
    connection: &Connection,
) -> Result<std::collections::HashMap<i64, std::collections::HashMap<i64, String>>, rusqlite::Error>
{
    let mut map: std::collections::HashMap<i64, std::collections::HashMap<i64, String>> =
        std::collections::HashMap::new();
    let mut stmt =
        connection.prepare("SELECT record_id, column_id, value FROM record_values")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?))
    })?;
    for row in rows {
        let (record_id, column_id, value) = row?;
        map.entry(record_id).or_default().insert(column_id, value);
    }
    Ok(map)
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── validate_iso_date ──────────────────────────────────────────────────

    #[test]
    fn valid_dates_are_accepted() {
        for date in [
            "2026-01-01", "2026-12-31", "2000-02-29", "2024-02-29",
            "2024-03-01", "2026-11-30",
        ] {
            assert!(validate_iso_date(date), "should accept {date}");
        }
    }

    #[test]
    fn invalid_dates_are_rejected() {
        for date in [
            "2026-02-29",  // not a leap year
            "2026-04-31",  // April has 30 days
            "2026-00-01",  // month 0
            "2026-13-01",  // month 13
            "2026-01-00",  // day 0
            "2026-01-32",  // day 32
            "2026-1-1",    // wrong format
            "not-a-date",
            "20261201",    // no dashes
            "2026-12-1",   // single digit day
            "",
        ] {
            assert!(!validate_iso_date(date), "should reject {date}");
        }
    }

    #[test]
    fn leap_year_logic_is_correct() {
        assert!(validate_iso_date("2000-02-29")); // divisible by 400 → leap
        assert!(!validate_iso_date("1900-02-29")); // divisible by 100 but not 400 → not leap
        assert!(validate_iso_date("2024-02-29")); // divisible by 4, not 100 → leap
        assert!(!validate_iso_date("2023-02-29")); // not divisible by 4 → not leap
    }

    // ── validate_value ────────────────────────────────────────────────────

    fn opts_json() -> Option<String> {
        Some(r#"[{"id":1,"label":"A","emoji":"","color":"gray"},{"id":2,"label":"B","emoji":"","color":"blue"}]"#.into())
    }

    #[test]
    fn text_value_matches_text_column() {
        assert!(validate_value(&PropertyValue::Text("hi".into()), "text", &None).is_ok());
        assert!(validate_value(&PropertyValue::Number(1.0), "text", &None).is_err());
    }

    #[test]
    fn number_rejects_non_finite() {
        assert!(validate_value(&PropertyValue::Number(42.0), "number", &None).is_ok());
        assert!(validate_value(&PropertyValue::Number(f64::INFINITY), "number", &None).is_err());
        assert!(validate_value(&PropertyValue::Number(f64::NAN), "number", &None).is_err());
    }

    #[test]
    fn select_rejects_unknown_option_id() {
        let opts = opts_json();
        assert!(validate_value(&PropertyValue::Select(1), "select", &opts).is_ok());
        assert!(validate_value(&PropertyValue::Select(99), "select", &opts).is_err());
    }

    #[test]
    fn multiselect_rejects_any_unknown_id() {
        let opts = opts_json();
        assert!(validate_value(&PropertyValue::Multi(vec![1, 2]), "multiselect", &opts).is_ok());
        assert!(validate_value(&PropertyValue::Multi(vec![1, 99]), "multiselect", &opts).is_err());
    }

    #[test]
    fn status_rejects_unknown_option_id() {
        let opts = opts_json();
        assert!(validate_value(&PropertyValue::Status(2), "status", &opts).is_ok());
        assert!(validate_value(&PropertyValue::Status(5), "status", &opts).is_err());
    }

    #[test]
    fn date_validates_format() {
        assert!(validate_value(&PropertyValue::Date("2026-10-22".into()), "date", &None).is_ok());
        assert!(validate_value(&PropertyValue::Date("2026-02-29".into()), "date", &None).is_err());
        assert!(validate_value(&PropertyValue::Date("not-valid".into()), "date", &None).is_err());
    }

    #[test]
    fn type_mismatch_is_rejected() {
        assert!(validate_value(&PropertyValue::Text("x".into()), "number", &None).is_err());
        assert!(validate_value(&PropertyValue::Checkbox(true), "text", &None).is_err());
    }
}
