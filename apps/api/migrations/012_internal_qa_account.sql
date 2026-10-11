ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'standard' CHECK(account_type IN ('standard','internal_qa'));

CREATE INDEX users_account_type ON users(account_type);
