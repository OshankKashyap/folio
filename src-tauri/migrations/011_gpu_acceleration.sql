ALTER TABLE workspace_settings ADD COLUMN gpu_acceleration INTEGER NOT NULL DEFAULT 1;
PRAGMA user_version = 11;
