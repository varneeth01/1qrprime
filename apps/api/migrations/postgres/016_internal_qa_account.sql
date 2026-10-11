ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('standard','internal_qa'));
CREATE INDEX IF NOT EXISTS users_account_type ON users(account_type);
