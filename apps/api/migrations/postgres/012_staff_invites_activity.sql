ALTER TABLE memberships ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS staff_invitations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('manager','staff')),
  permissions TEXT NOT NULL DEFAULT '{}',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  invited_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS staff_invites_tenant ON staff_invitations(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS staff_invites_token ON staff_invitations(token_hash);
CREATE TABLE IF NOT EXISTS login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  client_type TEXT NOT NULL DEFAULT 'web',
  platform TEXT,
  ip_address TEXT,
  user_agent TEXT,
  session_reference TEXT,
  failure_reason_code TEXT
);
CREATE INDEX IF NOT EXISTS login_events_user ON login_events(user_id, created_at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS payment_route_approvals (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL UNIQUE REFERENCES routes(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending_owner_approval','owner_approved','expired','revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS payment_route_approvals_tenant ON payment_route_approvals(tenant_id, created_at);
