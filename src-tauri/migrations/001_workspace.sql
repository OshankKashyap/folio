CREATE TABLE databases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL CHECK (icon IN ('layers', 'book', 'idea')),
    position INTEGER NOT NULL
);

CREATE TABLE saved_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    database_id INTEGER NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    layout TEXT NOT NULL CHECK (layout IN ('table', 'board', 'list')),
    filter_active INTEGER NOT NULL DEFAULT 0 CHECK (filter_active IN (0, 1)),
    sort_active INTEGER NOT NULL DEFAULT 0 CHECK (sort_active IN (0, 1)),
    compact INTEGER NOT NULL DEFAULT 0 CHECK (compact IN (0, 1)),
    show_owner INTEGER NOT NULL DEFAULT 1 CHECK (show_owner IN (0, 1)),
    position INTEGER NOT NULL
);

CREATE TABLE records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    database_id INTEGER NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 500),
    status TEXT NOT NULL CHECK (status IN ('To do', 'In progress', 'Done')),
    priority TEXT NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')),
    due_date TEXT,
    owner TEXT NOT NULL DEFAULT '' CHECK (length(owner) <= 200),
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX records_database_order ON records(database_id, position, id);
CREATE INDEX views_database_order ON saved_views(database_id, position, id);

PRAGMA user_version = 1;
