-- Customer contact context for public payment attempts.
-- Phone numbers are stored only on server-side order/payment records.
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS customer_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS table_id TEXT REFERENCES restaurant_tables(id) ON DELETE SET NULL;
