-- Customer contact context for public payment attempts.
-- Phone numbers are stored only on server-side order/payment records.
ALTER TABLE attempts ADD COLUMN customer_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE attempts ADD COLUMN table_id TEXT;
