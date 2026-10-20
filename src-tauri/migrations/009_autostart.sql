ALTER TABLE workspace_settings ADD COLUMN autostart INTEGER NOT NULL DEFAULT 0;
PRAGMA user_version = 9;
