-- Kept as a separate migration for databases that applied an earlier Batch 4
-- draft before the variant price snapshot was included.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_price_snapshot BIGINT;
