ALTER TABLE plans ADD COLUMN original_price_paise INTEGER;
ALTER TABLE plans ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE plans ADD COLUMN business_categories TEXT NOT NULL DEFAULT '[]';
ALTER TABLE plans ADD COLUMN max_staff INTEGER NOT NULL DEFAULT 0;

UPDATE plans
SET original_price_paise = CASE WHEN id='prime' THEN 159900 ELSE price_paise END,
    currency = 'INR',
    business_categories = CASE WHEN id='prime' THEN '["restaurant","cafe","hotel"]' ELSE '[]' END,
    max_staff = CASE WHEN id='prime' THEN 5 ELSE 0 END;

UPDATE plans
SET price_paise = 59900,
    entitlements = '{"locations":10,"staff":5,"orders":true,"analytics":true,"modules":true}'
WHERE id='prime';

CREATE TABLE sales_leads (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  category TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  location_count INTEGER NOT NULL CHECK(location_count > 0 AND location_count <= 1000),
  team_size INTEGER,
  website TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACTED','QUALIFIED','CONVERTED','CLOSED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sales_leads_status_created ON sales_leads(status, created_at);

CREATE TABLE billing_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK(status IN ('CREATED','VERIFIED','FAILED','CANCELLED')),
  receipt TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);
CREATE INDEX billing_payments_tenant ON billing_payments(tenant_id, created_at);
