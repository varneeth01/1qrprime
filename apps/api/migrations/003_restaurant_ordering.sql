CREATE TABLE menu_categories (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX menu_categories_location_name ON menu_categories(location_id, name);
CREATE INDEX menu_categories_order ON menu_categories(location_id, display_order);

CREATE TABLE modifier_groups (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_selection INTEGER NOT NULL DEFAULT 0 CHECK(min_selection >= 0),
  max_selection INTEGER NOT NULL DEFAULT 1 CHECK(max_selection >= min_selection),
  required INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE modifiers (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_paise INTEGER NOT NULL DEFAULT 0 CHECK(price_paise >= 0),
  available INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE menu_item_modifier_groups (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(item_id, group_id)
);
CREATE TABLE menu_item_variants (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK(price_paise >= 0),
  available INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE items ADD COLUMN category_id TEXT REFERENCES menu_categories(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN discounted_price_paise INTEGER;
ALTER TABLE items ADD COLUMN food_type TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE items ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN prep_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN tax_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN stock_status TEXT NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE items ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN bestseller INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN spicy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN recommended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN updated_at TEXT;
UPDATE items SET updated_at=CURRENT_TIMESTAMP WHERE updated_at IS NULL;
CREATE INDEX items_location_category_order ON items(location_id, category_id, display_order);

CREATE TABLE restaurant_tables (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_token TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX restaurant_tables_location ON restaurant_tables(location_id);
CREATE TABLE order_sequences (
  location_id TEXT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1000
);
CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES items(id),
  item_name_snapshot TEXT NOT NULL,
  variant_snapshot TEXT,
  unit_price_snapshot INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  line_total INTEGER NOT NULL,
  customer_note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE order_item_modifiers (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_name_snapshot TEXT NOT NULL,
  price_snapshot INTEGER NOT NULL
);
CREATE INDEX order_items_order ON order_items(order_id);

ALTER TABLE orders ADD COLUMN public_order_number TEXT;
ALTER TABLE orders ADD COLUMN customer_tracking_token TEXT;
ALTER TABLE orders ADD COLUMN table_id TEXT REFERENCES restaurant_tables(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN customer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN customer_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN delivery_address TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN landmark TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN tax_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN packaging_fee_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN service_fee_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN delivery_fee_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE orders ADD COLUMN accepted_at TEXT;
ALTER TABLE orders ADD COLUMN preparing_at TEXT;
ALTER TABLE orders ADD COLUMN ready_at TEXT;
ALTER TABLE orders ADD COLUMN completed_at TEXT;
ALTER TABLE orders ADD COLUMN rejected_at TEXT;
CREATE UNIQUE INDEX orders_public_number ON orders(location_id, public_order_number);
CREATE UNIQUE INDEX orders_tracking_token ON orders(customer_tracking_token);
CREATE INDEX orders_location_status ON orders(location_id, state, created_at);
