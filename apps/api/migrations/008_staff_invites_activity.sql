ALTER TABLE memberships ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}';
CREATE TABLE staff_invitations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('manager','staff')),
  permissions TEXT NOT NULL DEFAULT '{}',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  invited_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX staff_invites_tenant ON staff_invitations(tenant_id, created_at);
CREATE INDEX staff_invites_token ON staff_invitations(token_hash);
CREATE TABLE login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  success INTEGER NOT NULL DEFAULT 1,
  client_type TEXT NOT NULL DEFAULT 'web',
  platform TEXT,
  ip_address TEXT,
  user_agent TEXT,
  session_reference TEXT,
  failure_reason_code TEXT
);
CREATE INDEX login_events_user ON login_events(user_id, created_at);
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN last_active_at TEXT;
CREATE TABLE payment_route_approvals (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL UNIQUE REFERENCES routes(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending_owner_approval','owner_approved','expired','revoked')),
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX payment_route_approvals_tenant ON payment_route_approvals(tenant_id, created_at);
