ALTER TABLE databases ADD COLUMN emoji TEXT NOT NULL DEFAULT '';
ALTER TABLE databases ADD COLUMN custom_icon TEXT;

PRAGMA user_version = 4;
