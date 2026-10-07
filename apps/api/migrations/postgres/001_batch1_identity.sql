-- 1QR Prime PostgreSQL Batch 1 schema.
-- This migration intentionally covers only identity, sessions, tenant access,
-- and onboarding/business context. Later-domain tables are added separately.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  admin_role TEXT CHECK (admin_role IN ('support', 'admin')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entitlements TEXT NOT NULL,
  price_paise BIGINT
);

INSERT INTO plans (id, name, entitlements, price_paise) VALUES
  ('starter', 'Starter', '{"locations":1,"staff":0,"orders":true,"analytics":true,"modules":true}', 0),
  ('prime', 'Prime', '{"locations":10,"staff":20,"orders":true,"analytics":true,"modules":true}', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'starter' REFERENCES plans(id),
  billing_state TEXT NOT NULL DEFAULT 'free'
    CHECK (billing_state IN ('free', 'active', 'grace', 'expired', 'suspended'))
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS memberships_tenant_idx ON memberships (tenant_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The current API contract stores epoch milliseconds; keep that contract
  -- during Batch 1 and normalize to TIMESTAMPTZ in a later compatibility pass.
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS email_tokens_user_purpose_idx
  ON email_tokens (user_id, purpose);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  profile TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  onboarding_step INTEGER NOT NULL DEFAULT 0,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  active_route_id TEXT,
  previous_route_id TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS locations_tenant_idx ON locations (tenant_id);
CREATE INDEX IF NOT EXISTS locations_status_idx ON locations (status);

CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_tenant_created_idx ON audit (tenant_id, created_at);

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_update ON audit;
CREATE TRIGGER audit_no_update
  BEFORE UPDATE ON audit
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

DROP TRIGGER IF EXISTS audit_no_delete ON audit;
CREATE TRIGGER audit_no_delete
  BEFORE DELETE ON audit
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
