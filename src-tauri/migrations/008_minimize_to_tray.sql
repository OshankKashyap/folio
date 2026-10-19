ALTER TABLE workspace_settings ADD COLUMN minimize_to_tray INTEGER NOT NULL DEFAULT 0;
PRAGMA user_version = 8;
