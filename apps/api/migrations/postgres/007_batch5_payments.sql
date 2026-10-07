-- Batch 5 payment routes and payment attempts.
-- routes are created by the customer-page migration; this migration adds the
-- durable attempt records used by general and order-linked Pay.

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
  snapshot TEXT NOT NULL,
  amount_paise BIGINT CHECK (amount_paise IS NULL OR amount_paise > 0),
  state TEXT NOT NULL DEFAULT 'confirmation_pending',
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (location_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS attempts_location_created_idx
  ON attempts (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attempts_order_idx
  ON attempts (order_id);
CREATE INDEX IF NOT EXISTS attempts_state_idx
  ON attempts (location_id, state, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS routes_one_active_per_location_idx
  ON routes (location_id)
  WHERE state = 'active';
