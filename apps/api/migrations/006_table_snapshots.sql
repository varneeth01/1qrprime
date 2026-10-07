ALTER TABLE orders ADD COLUMN table_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE restaurant_tables ADD COLUMN updated_at TEXT;
UPDATE restaurant_tables SET updated_at=CURRENT_TIMESTAMP WHERE updated_at IS NULL;
CREATE INDEX orders_location_table_status ON orders(location_id, table_id, state, created_at);
