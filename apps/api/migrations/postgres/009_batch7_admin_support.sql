-- Batch 7 final operational/admin records.

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reports_location_created_idx ON reports (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_notes_tenant_created_idx ON support_notes (tenant_id, created_at DESC);

-- Account deletion retains audit history while allowing the deleted actor row
-- to disappear. Existing audit rows remain immutable and actor_id becomes NULL.
ALTER TABLE audit ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE audit DROP CONSTRAINT IF EXISTS audit_actor_id_fkey;
ALTER TABLE audit ADD CONSTRAINT audit_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
