ALTER TABLE plans ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN display_order INTEGER NOT NULL DEFAULT 100;
ALTER TABLE plans ADD COLUMN recommended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN created_at TEXT;
ALTER TABLE plans ADD COLUMN updated_at TEXT;
UPDATE plans SET created_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE plans SET price_paise=59900, display_order=10, recommended=1, active=1 WHERE id='prime';
