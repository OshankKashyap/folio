-- 010_dynamic_columns.sql
-- Creates the dynamic columns system and migrates existing hardcoded data.
-- This runs inside a single transaction managed by the migrate() function.

CREATE TABLE columns (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    database_id INTEGER NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    type     TEXT NOT NULL CHECK (type IN ('text','number','select','multiselect','checkbox','status','date')),
    options  TEXT,
    position INTEGER NOT NULL
);

CREATE TABLE record_values (
    record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    value     TEXT NOT NULL,
    PRIMARY KEY (record_id, column_id)
);

CREATE INDEX columns_database_order ON columns(database_id, position, id);
CREATE INDEX record_values_record   ON record_values(record_id);
CREATE INDEX record_values_column   ON record_values(column_id);

-- Seed columns for every existing database and migrate values.
-- Status options: id 1=To do, 2=In progress, 3=Done
-- Priority options: id 1=High, 2=Medium, 3=Low
-- Options JSON schema: [{"id":N,"label":"...","emoji":"","color":"..."}]

INSERT INTO columns (database_id, name, type, options, position)
SELECT id, 'Status', 'status',
    '[{"id":1,"label":"To do","emoji":"","color":"gray"},{"id":2,"label":"In progress","emoji":"","color":"blue"},{"id":3,"label":"Done","emoji":"","color":"green"}]',
    0
FROM databases;

INSERT INTO columns (database_id, name, type, options, position)
SELECT id, 'Priority', 'select',
    '[{"id":1,"label":"High","emoji":"","color":"red"},{"id":2,"label":"Medium","emoji":"","color":"orange"},{"id":3,"label":"Low","emoji":"","color":"gray"}]',
    1
FROM databases;

INSERT INTO columns (database_id, name, type, options, position)
SELECT id, 'Due date', 'date', NULL, 2
FROM databases;

INSERT INTO columns (database_id, name, type, options, position)
SELECT id, 'Owner', 'text', NULL, 3
FROM databases;

-- Migrate Status values: map old string to option id
INSERT INTO record_values (record_id, column_id, value)
SELECT r.id,
       (SELECT c.id FROM columns c WHERE c.database_id = r.database_id AND c.name = 'Status' AND c.type = 'status'),
       CASE r.status
           WHEN 'To do'       THEN '{"Status":1}'
           WHEN 'In progress' THEN '{"Status":2}'
           WHEN 'Done'        THEN '{"Status":3}'
       END
FROM records r
WHERE r.status IS NOT NULL;

-- Migrate Priority values
INSERT INTO record_values (record_id, column_id, value)
SELECT r.id,
       (SELECT c.id FROM columns c WHERE c.database_id = r.database_id AND c.name = 'Priority' AND c.type = 'select'),
       CASE r.priority
           WHEN 'High'   THEN '{"Select":1}'
           WHEN 'Medium' THEN '{"Select":2}'
           WHEN 'Low'    THEN '{"Select":3}'
       END
FROM records r
WHERE r.priority IS NOT NULL;

-- Migrate Due date values (already ISO YYYY-MM-DD)
INSERT INTO record_values (record_id, column_id, value)
SELECT r.id,
       (SELECT c.id FROM columns c WHERE c.database_id = r.database_id AND c.name = 'Due date' AND c.type = 'date'),
       json_object('Date', r.due_date)
FROM records r
WHERE r.due_date IS NOT NULL AND trim(r.due_date) != '';

-- Migrate Owner values
INSERT INTO record_values (record_id, column_id, value)
SELECT r.id,
       (SELECT c.id FROM columns c WHERE c.database_id = r.database_id AND c.name = 'Owner' AND c.type = 'text'),
       json_object('Text', r.owner)
FROM records r
WHERE r.owner IS NOT NULL AND trim(r.owner) != '';

-- Drop the four hardcoded columns from records.
-- SQLite does not support DROP COLUMN in very old versions, but Tauri's bundled
-- SQLite supports it (3.35+). The project already uses features requiring 3.35+.
ALTER TABLE records DROP COLUMN status;
ALTER TABLE records DROP COLUMN priority;
ALTER TABLE records DROP COLUMN due_date;
ALTER TABLE records DROP COLUMN owner;

PRAGMA user_version = 10;
