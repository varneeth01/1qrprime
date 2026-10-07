-- Batch 4 order persistence. Live menu references are nullable so historical
-- snapshots survive menu edits and archival.

CREATE TABLE IF NOT EXISTS order_sequences (
  location_id TEXT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  next_number BIGINT NOT NULL DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  access_token TEXT NOT NULL,
  state TEXT NOT NULL,
  payment_state TEXT NOT NULL DEFAULT 'pending',
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  lines TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  order_type TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  public_order_number TEXT,
  customer_tracking_token TEXT,
  table_id TEXT REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  table_name_snapshot TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  delivery_address TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  tax_paise BIGINT NOT NULL DEFAULT 0,
  discount_paise BIGINT NOT NULL DEFAULT 0,
  packaging_fee_paise BIGINT NOT NULL DEFAULT 0,
  service_fee_paise BIGINT NOT NULL DEFAULT 0,
  delivery_fee_paise BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  accepted_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  UNIQUE (location_id, idempotency_key),
  UNIQUE (location_id, public_order_number),
  UNIQUE (customer_tracking_token)
);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  item_name_snapshot TEXT NOT NULL,
  variant_snapshot TEXT,
  variant_price_snapshot BIGINT,
  unit_price_snapshot BIGINT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total BIGINT NOT NULL,
  customer_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_name_snapshot TEXT NOT NULL,
  price_snapshot BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (location_id, day, kind)
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMPTZ,
  tries INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS orders_location_created_idx ON orders (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_location_state_idx ON orders (location_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_table_created_idx ON orders (table_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_events_order_created_idx ON order_events (order_id, created_at ASC);
CREATE INDEX IF NOT EXISTS outbox_location_created_idx ON outbox (location_id, created_at);
