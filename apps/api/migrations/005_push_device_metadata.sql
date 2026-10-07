ALTER TABLE push_tokens ADD COLUMN platform TEXT NOT NULL DEFAULT 'expo';
ALTER TABLE push_tokens ADD COLUMN device_id TEXT;
ALTER TABLE push_tokens ADD COLUMN app_version TEXT;
ALTER TABLE push_tokens ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_tokens ADD COLUMN last_seen_at TEXT;
CREATE INDEX push_tokens_user_enabled ON push_tokens(user_id,enabled);
