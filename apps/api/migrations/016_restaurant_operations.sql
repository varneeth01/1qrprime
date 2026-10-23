ALTER TABLE memberships ADD COLUMN operational_role TEXT NOT NULL DEFAULT 'service';
ALTER TABLE staff_invitations ADD COLUMN operational_role TEXT NOT NULL DEFAULT 'service';
CREATE TABLE service_requests (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  table_id TEXT NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('WAITER','WATER','CUTLERY','BILL')),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','ACKNOWLEDGED','COMPLETED','CANCELLED')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0 AND quantity <= 10),
  assigned_staff_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  completed_at TEXT
);
CREATE INDEX service_requests_location_status ON service_requests(location_id,status,created_at);
CREATE INDEX service_requests_table_type ON service_requests(table_id,type,status);
