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

INSERT INTO databases (id, name, description, icon, position) VALUES
    (1, 'Projects', 'A little structure for everything you’re building.', 'layers', 0),
    (2, 'Reading list', 'Good ideas start with a good book.', 'book', 1),
    (3, 'Ideas', 'A home for your next big thing.', 'idea', 2);

INSERT INTO saved_views (database_id, name, layout, filter_active, position)
SELECT id, CASE WHEN id = 1 THEN 'All projects' WHEN id = 2 THEN 'All books' ELSE 'All ideas' END, 'table', 0, 0 FROM databases;
INSERT INTO saved_views (database_id, name, layout, filter_active, position)
SELECT id, 'In progress', 'table', 1, 1 FROM databases;
INSERT INTO saved_views (database_id, name, layout, position)
SELECT id, 'By status', 'board', 2 FROM databases;

INSERT INTO records (database_id, name, status, priority, due_date, owner, position) VALUES
    (1, 'Network monitor', 'In progress', 'High', '2026-10-20', 'Oshank', 0),
    (1, 'Database workspace', 'In progress', 'High', '2026-10-24', 'Oshank', 1),
    (1, 'Portfolio refresh', 'To do', 'Medium', '2026-10-28', 'Oshank', 2),
    (1, 'API documentation', 'Done', 'Medium', '2026-10-14', 'Oshank', 3),
    (1, 'CLI utilities', 'To do', 'Low', '2026-11-02', 'Oshank', 4),
    (1, 'Design system', 'In progress', 'Medium', '2026-10-22', 'Oshank', 5),
    (2, 'Designing Data-Intensive Applications', 'In progress', 'High', '2026-10-30', 'Oshank', 0),
    (2, 'The Pragmatic Programmer', 'To do', 'Medium', '2026-11-05', 'Oshank', 1),
    (3, 'Offline-first notes', 'To do', 'High', '2026-10-25', 'Oshank', 0),
    (3, 'A calmer task manager', 'In progress', 'Medium', '2026-11-01', 'Oshank', 1);

PRAGMA user_version = 1;
