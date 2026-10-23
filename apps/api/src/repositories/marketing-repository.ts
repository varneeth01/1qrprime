import { randomUUID } from "node:crypto";
import type { AsyncDatabase, DbTransaction } from "../async-db.js";
import { CustomerRepository } from "./customer-repository.js";
import { isPromotionActive } from "../promotion-window.js";

type Executor = AsyncDatabase | DbTransaction;
const parse = (value: unknown) => {
  if (typeof value === "string") { try { return JSON.parse(value); } catch { return {}; } }
  return value || {};
};

export class MarketingRepository {
  constructor(private readonly db: AsyncDatabase) {}

  async enqueueCampaignDelivery(tx: DbTransaction, input: { id: string; tenantId: string; campaignId: string; availableAt: string }) {
    await tx.run(
      "INSERT INTO marketing_jobs(id,tenant_id,campaign_id,job_type,status,available_at,idempotency_key) VALUES (?,?,?,?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING",
      [input.id, input.tenantId, input.campaignId, "campaign_delivery", "queued", input.availableAt, `campaign:${input.campaignId}:delivery`],
    );
    return this.db.get<any>("SELECT * FROM marketing_jobs WHERE idempotency_key=?", [`campaign:${input.campaignId}:delivery`]);
  }

  claimDueJobs(limit = 20) {
    return this.db.transaction(async (tx) => {
      const query = this.db.driver === "postgres"
        ? "SELECT * FROM marketing_jobs WHERE status='queued' AND available_at<=? ORDER BY available_at ASC LIMIT ? FOR UPDATE SKIP LOCKED"
        : "SELECT * FROM marketing_jobs WHERE status='queued' AND available_at<=? ORDER BY available_at ASC LIMIT ?";
      const jobs = await tx.all<any>(query, [new Date().toISOString(), limit]);
      const claimed: any[] = [];
      for (const job of jobs) {
        const updated = await tx.run("UPDATE marketing_jobs SET status='running',attempts=attempts+1,locked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'", [job.id]);
        if (updated.rowCount === 1) claimed.push({ ...job, status: "running", attempts: Number(job.attempts || 0) + 1 });
      }
      return claimed;
    });
  }

  async listCampaigns(tenantId: string, locationId?: string) {
    const rows = await this.db.all<any>(
      locationId
        ? "SELECT id,name,status,audience_json,scheduled_at,created_at,updated_at FROM campaigns WHERE tenant_id=? AND location_id=? ORDER BY created_at DESC LIMIT 100"
        : "SELECT id,name,status,audience_json,scheduled_at,created_at,updated_at FROM campaigns WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",
      locationId ? [tenantId, locationId] : [tenantId],
    );
    return rows.map((row) => ({ ...row, audience: parse(row.audience_json) }));
  }

  async createCampaign(tx: DbTransaction, input: { id: string; tenantId: string; locationId?: string; name: string; templateId?: string; audience: any; promotionId?: string; challengeId?: string; scheduledAt?: string; actorId: string }) {
    await tx.run(
      "INSERT INTO campaigns(id,tenant_id,location_id,name,status,template_id,audience_json,promotion_id,challenge_id,scheduled_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [input.id, input.tenantId, input.locationId || null, input.name, input.scheduledAt ? "scheduled" : "draft", input.templateId || null, JSON.stringify(input.audience || {}), input.promotionId || null, input.challengeId || null, input.scheduledAt || null, input.actorId],
    );
    return this.db.get<any>("SELECT id,name,status,audience_json,scheduled_at,created_at FROM campaigns WHERE id=? AND tenant_id=?", [input.id, input.tenantId]);
  }

  async queueRecipients(tx: DbTransaction, campaignId: string, tenantId: string, audience: any) {
    const customerRepository = new CustomerRepository(this.db);
    const recipients = await customerRepository.audience(tenantId, audience);
    for (const recipient of recipients) {
      await tx.run(
        "INSERT INTO campaign_recipients(id,campaign_id,customer_id,phone_e164,consent_status_at_send) VALUES (?,?,?,?,?) ON CONFLICT(campaign_id,customer_id) DO NOTHING",
        [randomUUID(), campaignId, recipient.id, recipient.phone_e164, recipient.status],
      );
    }
    return recipients.length;
  }

  listRecipients(campaignId: string, tenantId: string) {
    return this.db.all<any>(
      "SELECT cr.id,cr.status,cr.sent_at,cr.delivered_at,cr.read_at,cr.failed_at,cr.failure_code FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id WHERE cr.campaign_id=? AND c.tenant_id=? ORDER BY cr.created_at LIMIT 500",
      [campaignId, tenantId],
    );
  }

  async listPromotions(locationId: string, tenantId: string) {
    const rows = await this.db.all<any>("SELECT * FROM promotions WHERE location_id=? AND tenant_id=? ORDER BY start_at DESC LIMIT 100", [locationId, tenantId]);
    return rows.map((row) => ({ ...row, target: parse(row.target_json), recurrence: parse(row.recurrence_json) }));
  }

  async activePromotions(locationId: string) {
    const now = new Date().toISOString();
    const rows = await this.db.all<any>("SELECT * FROM promotions WHERE location_id=? AND status IN ('scheduled','active') AND start_at<=? AND end_at>? ORDER BY priority DESC,start_at ASC LIMIT 5", [locationId, now, now]);
    return rows.filter((row) => isPromotionActive(row)).map((row) => ({
      id: row.id,
      name: row.name,
      title: row.customer_title,
      description: row.description,
      imageUrl: row.image_url,
      type: row.promotion_type,
      valuePaise: Number(row.value_paise),
      target: { allMenu: Boolean(parse(row.target_json).allMenu) },
      endsAt: row.end_at,
    }));
  }

  async publicPromotion(locationId: string, promotionId: string) {
    const row = await this.db.get<any>(
      "SELECT id,name,customer_title,description,image_url,promotion_type,value_paise,target_json,start_at,end_at,recurrence_json,status FROM promotions WHERE id=? AND location_id=?",
      [promotionId, locationId],
    );
    if (!row) return undefined;
    const now = Date.now();
    const start = new Date(row.start_at).getTime();
    const end = new Date(row.end_at).getTime();
    const active = isPromotionActive(row);
    const state = active ? "active" : now < start ? "scheduled" : "expired";
    const target = parse(row.target_json);
    const itemIds = Array.isArray(target.itemIds) ? target.itemIds : [];
    const categoryIds = Array.isArray(target.categoryIds) ? target.categoryIds : [];
    const items = target.allMenu
      ? await this.db.all<any>("SELECT id,name,description,price_paise,image,section,category_id FROM items WHERE location_id=? AND archived=FALSE AND available=TRUE ORDER BY display_order,name LIMIT 50", [locationId])
      : await this.db.all<any>("SELECT id,name,description,price_paise,image,section,category_id FROM items WHERE location_id=? AND archived=FALSE AND available=TRUE AND (id IN (" + (itemIds.length ? itemIds.map(() => "?").join(",") : "NULL") + ") OR category_id IN (" + (categoryIds.length ? categoryIds.map(() => "?").join(",") : "NULL") + ")) ORDER BY display_order,name LIMIT 50", [locationId, ...itemIds, ...categoryIds]);
    return {
      id: row.id,
      title: row.customer_title,
      description: row.description,
      imageUrl: row.image_url,
      type: row.promotion_type,
      valuePaise: Number(row.value_paise),
      state,
      startsAt: row.start_at,
      endsAt: row.end_at,
      target: { allMenu: Boolean(target.allMenu), itemIds, categoryIds },
      items,
    };
  }

  async publicRewards(locationId: string, phoneE164: string) {
    const rows = await this.db.all<any>(
      `SELECT e.id,e.reward_type,e.reward_value,e.status,e.issued_at,e.expires_at,
              ch.name challenge_name,ch.customer_title,ch.description
       FROM challenge_reward_entitlements e
       JOIN customers c ON c.id=e.customer_id AND c.tenant_id=e.tenant_id
       JOIN challenges ch ON ch.id=e.challenge_id AND ch.location_id=?
       WHERE e.tenant_id=(SELECT tenant_id FROM locations WHERE id=?) AND c.phone_e164=?
       ORDER BY e.issued_at DESC`,
      [locationId, locationId, phoneE164],
    );
    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      status: row.status === "available" && row.expires_at && new Date(row.expires_at).getTime() <= now ? "expired" : row.status,
      rewardType: row.reward_type,
      rewardValue: Number(row.reward_value),
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      challengeName: row.challenge_name,
      challengeTitle: row.customer_title,
      description: row.description,
    }));
  }

  async listChallenges(locationId: string, tenantId: string) {
    const rows = await this.db.all<any>("SELECT * FROM challenges WHERE location_id=? AND tenant_id=? ORDER BY start_at DESC LIMIT 100", [locationId, tenantId]);
    return rows.map((row) => ({ ...row, showInMenu: Boolean(row.show_in_menu), featured: Boolean(row.featured) }));
  }

  async activeChallenges(locationId: string) {
    const now = new Date().toISOString();
    const rows = await this.db.all<any>("SELECT id,name,customer_title,description,image_url,rule_type,target,reward_type,reward_value,start_at,end_at,featured FROM challenges WHERE location_id=? AND status IN ('scheduled','active') AND show_in_menu=TRUE AND start_at<=? AND end_at>? ORDER BY featured DESC,start_at ASC LIMIT 5", [locationId, now, now]);
    return rows.map((row) => ({ ...row, target: Number(row.target), rewardValue: Number(row.reward_value), featured: Boolean(row.featured), startsAt: row.start_at, endsAt: row.end_at }));
  }

  async createPromotion(tx: DbTransaction, input: any) {
    await tx.run(
      "INSERT INTO promotions(id,tenant_id,location_id,name,customer_title,description,image_url,promotion_type,value_paise,target_json,start_at,end_at,recurrence_json,status,priority,stackable,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [input.id, input.tenantId, input.locationId, input.name, input.customerTitle, input.description, input.imageUrl || null, input.type, input.valuePaise, JSON.stringify(input.target || {}), input.startAt, input.endAt, input.recurrence ? JSON.stringify(input.recurrence) : null, input.status, input.priority, input.stackable, input.actorId],
    );
    return this.db.get<any>("SELECT * FROM promotions WHERE id=? AND tenant_id=?", [input.id, input.tenantId]);
  }

  async createChallenge(tx: DbTransaction, input: any) {
    await tx.run(
      "INSERT INTO challenges(id,tenant_id,location_id,name,customer_title,description,image_url,rule_type,target,reward_type,reward_value,reward_item_id,start_at,end_at,show_in_menu,featured,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [input.id, input.tenantId, input.locationId, input.name, input.customerTitle, input.description, input.imageUrl || null, input.ruleType, input.target, input.rewardType, input.rewardValue, input.rewardItemId || null, input.startAt, input.endAt, input.showInMenu, input.featured, input.status, input.actorId],
    );
    return this.db.get<any>("SELECT * FROM challenges WHERE id=? AND tenant_id=?", [input.id, input.tenantId]);
  }

  async recordCompletedOrder(input: { tenantId: string; locationId: string; customerId?: string | null; phoneE164?: string; amountPaise: number; lines?: any[] }) {
    const customer = input.customerId
      ? await this.db.get<any>("SELECT id FROM customers WHERE id=? AND tenant_id=?", [input.customerId, input.tenantId])
      : input.phoneE164
        ? await this.db.get<any>("SELECT id FROM customers WHERE tenant_id=? AND phone_e164=?", [input.tenantId, input.phoneE164])
        : undefined;
    if (!customer) return;
    const now = new Date().toISOString();
    const challenges = await this.db.all<any>("SELECT * FROM challenges WHERE location_id=? AND tenant_id=? AND status IN ('scheduled','active') AND start_at<=? AND end_at>?", [input.locationId, input.tenantId, now, now]);
    for (const challenge of challenges) {
      const increment = challenge.rule_type === "SPEND_AMOUNT" ? input.amountPaise : 1;
      const current = await this.db.get<any>("SELECT * FROM challenge_progress WHERE challenge_id=? AND customer_id=?", [challenge.id, customer.id]);
      const next = Math.min(Number(challenge.target), Number(current?.progress || 0) + increment);
      const status = next >= Number(challenge.target) ? "COMPLETED" : "ACTIVE";
      await this.db.run(
        `INSERT INTO challenge_progress(id,challenge_id,customer_id,progress,target,status,completed_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(challenge_id,customer_id) DO UPDATE SET progress=excluded.progress,target=excluded.target,status=CASE WHEN challenge_progress.status='REWARDED' THEN 'REWARDED' ELSE excluded.status END,completed_at=CASE WHEN excluded.status='COMPLETED' THEN COALESCE(challenge_progress.completed_at,excluded.completed_at) ELSE challenge_progress.completed_at END,updated_at=excluded.updated_at`,
        [randomUUID(), challenge.id, customer.id, next, Number(challenge.target), status, status === "COMPLETED" ? now : null, now],
      );
      if (status === "COMPLETED") {
        await this.db.run(
          `INSERT INTO challenge_reward_entitlements(id,tenant_id,challenge_id,customer_id,reward_type,reward_value,reward_item_id,status,issued_at,expires_at)
           VALUES (?,?,?,?,?,?,?,'available',?,?)
           ON CONFLICT(challenge_id,customer_id) DO NOTHING`,
          [randomUUID(), input.tenantId, challenge.id, customer.id, challenge.reward_type, Number(challenge.reward_value), challenge.reward_item_id || null, now, challenge.end_at],
        );
      }
    }
  }
}
