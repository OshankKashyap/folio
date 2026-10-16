-- One-time reset of the pre-onboarding workspace, including cascading views/records.
DELETE FROM records;
DELETE FROM saved_views;
DELETE FROM databases;
DELETE FROM sqlite_sequence WHERE name IN ('databases', 'saved_views', 'records');

CREATE TABLE workspace_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    accent_color TEXT NOT NULL CHECK (length(accent_color) = 7 AND accent_color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]')
);

PRAGMA user_version = 2;
