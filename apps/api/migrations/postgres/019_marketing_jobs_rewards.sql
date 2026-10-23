ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'MARKETING';
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS components_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reward_entitlement_id TEXT;

CREATE TABLE IF NOT EXISTS marketing_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK(job_type IN ('campaign_delivery','template_sync','webhook_reconcile')),
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')) DEFAULT 'queued',
  available_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS marketing_jobs_due ON marketing_jobs(status,available_at);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id TEXT PRIMARY KEY,
  provider_message_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','delivered','read','failed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_message_id,status)
);

CREATE TABLE IF NOT EXISTS challenge_reward_entitlements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL CHECK(reward_type IN ('flat_discount','percentage_discount','item')),
  reward_value BIGINT NOT NULL CHECK(reward_value > 0),
  reward_item_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('available','redeemed','expired')) DEFAULT 'available',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  UNIQUE(challenge_id,customer_id)
);
CREATE INDEX IF NOT EXISTS challenge_rewards_customer ON challenge_reward_entitlements(tenant_id,customer_id,status);
