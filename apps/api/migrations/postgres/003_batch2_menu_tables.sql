-- 1QR Prime PostgreSQL Batch 2 schema: menu and restaurant tables.

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_token TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS restaurant_tables_location_idx
  ON restaurant_tables (location_id, enabled, name);

CREATE INDEX IF NOT EXISTS menu_items_location_category_idx
  ON items (location_id, category_id, display_order);

CREATE INDEX IF NOT EXISTS menu_variants_item_idx
  ON menu_item_variants (item_id, available, display_order);

CREATE INDEX IF NOT EXISTS modifier_groups_location_idx
  ON modifier_groups (location_id, enabled, display_order);

CREATE INDEX IF NOT EXISTS modifiers_group_idx
  ON modifiers (group_id, available, display_order);
