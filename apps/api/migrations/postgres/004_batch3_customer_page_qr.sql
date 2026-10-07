-- Batch 3 public customer-page and QR read dependencies.
-- Appearance and action configuration remain in locations.profile, matching
-- the existing API contract. Routes are relational because Pay capability
-- depends on an active, business-owned payment route.

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  provider TEXT NOT NULL,
  vpa TEXT NOT NULL,
  payee TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'verification_pending', 'verified', 'active', 'disabled', 'failed')),
  evidence TEXT,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS routes_location_state_idx
  ON routes (location_id, state);

CREATE INDEX IF NOT EXISTS locations_public_lookup_idx
  ON locations (public_id, published);
