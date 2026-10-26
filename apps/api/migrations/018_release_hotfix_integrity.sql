-- Normalize invalid legacy zero/equal menu discounts.
-- Historical completed-order snapshots are intentionally left unchanged.
UPDATE items
SET discounted_price_paise=NULL
WHERE discounted_price_paise IS NOT NULL
  AND (discounted_price_paise <= 0 OR discounted_price_paise >= price_paise);
