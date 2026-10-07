-- Batch 6 operational persistence.

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  message TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS requests_location_created_idx
  ON requests (location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'expo',
  device_id TEXT,
  app_version TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_tokens_user_enabled_idx
  ON push_tokens (user_id, enabled);
CREATE INDEX IF NOT EXISTS push_tokens_device_idx
  ON push_tokens (user_id, device_id);

CREATE INDEX IF NOT EXISTS events_location_day_idx
  ON events (location_id, day DESC);
CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox (created_at)
  WHERE delivered_at IS NULL;
