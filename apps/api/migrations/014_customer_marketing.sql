-- Tenant-scoped customer identity, explicit consent, marketing campaigns,
-- scheduled offers and challenge progress. No public endpoint may expose the
-- phone columns directly.
ALTER TABLE orders ADD COLUMN customer_id TEXT;
ALTER TABLE attempts ADD COLUMN customer_id TEXT;

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  display_phone TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_order_at TEXT,
  order_count INTEGER NOT NULL DEFAULT 0,
  total_spend_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, phone_e164)
);
CREATE INDEX customers_tenant_seen ON customers(tenant_id,last_seen_at DESC);

CREATE TABLE customer_consents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('whatsapp')),
  purpose TEXT NOT NULL CHECK(purpose IN ('marketing')),
  status TEXT NOT NULL CHECK(status IN ('opted_in','opted_out')),
  consented_at TEXT,
  withdrawn_at TEXT,
  source TEXT NOT NULL,
  consent_text_version TEXT NOT NULL,
  business_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id,channel,purpose)
);
CREATE INDEX customer_consents_tenant_status ON customer_consents(tenant_id,status,channel,purpose);

CREATE TABLE marketing_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('meta_cloud_api')),
  status TEXT NOT NULL CHECK(status IN ('not_connected','pending','connected','suspended')) DEFAULT 'not_connected',
  business_account_id TEXT,
  phone_number_id TEXT,
  credential_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,location_id,provider)
);

CREATE TABLE whatsapp_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  body_preview TEXT NOT NULL,
  provider_template_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','scheduled','sending','sent','paused','failed')) DEFAULT 'draft',
  template_id TEXT REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  audience_json TEXT NOT NULL DEFAULT '{}',
  promotion_id TEXT,
  challenge_id TEXT,
  scheduled_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX campaigns_tenant_status ON campaigns(tenant_id,status,scheduled_at);

CREATE TABLE campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  consent_status_at_send TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','sent','delivered','read','failed','skipped')) DEFAULT 'queued',
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  failed_at TEXT,
  failure_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id,customer_id)
);
CREATE INDEX campaign_recipients_status ON campaign_recipients(campaign_id,status);

CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  customer_title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  promotion_type TEXT NOT NULL CHECK(promotion_type IN ('percentage','flat','special_price')),
  value_paise INTEGER NOT NULL CHECK(value_paise > 0),
  target_json TEXT NOT NULL DEFAULT '{}',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  recurrence_json TEXT,
  status TEXT NOT NULL CHECK(status IN ('draft','scheduled','active','paused','expired')) DEFAULT 'scheduled',
  priority INTEGER NOT NULL DEFAULT 0,
  stackable INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX promotions_location_window ON promotions(location_id,status,start_at,end_at,priority);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  customer_title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('ORDER_COUNT','VISIT_COUNT','SPEND_AMOUNT','ITEM_QUANTITY','CATEGORY_QUANTITY')),
  target INTEGER NOT NULL CHECK(target > 0),
  reward_type TEXT NOT NULL CHECK(reward_type IN ('flat_discount','percentage_discount','item')),
  reward_value INTEGER NOT NULL CHECK(reward_value > 0),
  reward_item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  show_in_menu INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('draft','scheduled','active','paused','expired')) DEFAULT 'scheduled',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX challenges_location_window ON challenges(location_id,status,start_at,end_at);

CREATE TABLE challenge_progress (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','COMPLETED','REWARDED','EXPIRED')) DEFAULT 'ACTIVE',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  reward_status TEXT NOT NULL DEFAULT 'available',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(challenge_id,customer_id)
);
