CREATE TABLE record_pages (
    record_id INTEGER PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

PRAGMA user_version = 5;
