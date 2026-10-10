ALTER TABLE outbox ADD COLUMN IF NOT EXISTS recipient_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS table_staff_assignments (
  table_id TEXT NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (table_id, user_id)
);
CREATE INDEX IF NOT EXISTS table_staff_assignments_user ON table_staff_assignments(user_id, tenant_id);
