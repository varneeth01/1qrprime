import { randomUUID } from "node:crypto";
import type { AsyncDatabase, DbTransaction } from "../async-db.js";

type Executor = AsyncDatabase | DbTransaction;

function maskPhone(phone: string) {
  return phone.length >= 10 ? `${phone.slice(0, 3)}••• ••${phone.slice(-3)}` : "••••••••••";
}

function parseJson(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value || {};
}

export class CustomerRepository {
  constructor(private readonly db: AsyncDatabase) {}

  async recordActivity(executor: Executor, input: { tenantId: string; phoneE164: string; source: string; locationId?: string; marketingConsent?: boolean }) {
    const now = new Date().toISOString();
    const customerId = randomUUID();
    const existing = await executor.get<any>("SELECT id FROM customers WHERE tenant_id=? AND phone_e164=?", [input.tenantId, input.phoneE164]);
    await executor.run(
      `INSERT INTO customers(id,tenant_id,phone_e164,display_phone,first_seen_at,last_seen_at,updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(tenant_id,phone_e164) DO UPDATE SET last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at`,
      [customerId, input.tenantId, input.phoneE164, input.phoneE164, now, now, now],
    );
    const customer = await executor.get<any>("SELECT * FROM customers WHERE tenant_id=? AND phone_e164=?", [input.tenantId, input.phoneE164]);
    if (!customer) throw new Error("Customer identity could not be created");
    if (!existing) await executor.run("UPDATE customers SET display_phone=? WHERE id=?", [input.phoneE164, customer.id]);
    if (input.marketingConsent === true) {
      await this.setConsent(executor, {
        tenantId: input.tenantId,
        customerId: customer.id,
        businessId: input.locationId,
        status: "opted_in",
        source: input.source,
      });
    }
    return customer;
  }

  async recordCompletedOrder(executor: Executor, input: { tenantId: string; customerId?: string | null; phoneE164?: string; amountPaise: number; locationId?: string }) {
    const customer = input.customerId
      ? await executor.get<any>("SELECT * FROM customers WHERE id=? AND tenant_id=?", [input.customerId, input.tenantId])
      : input.phoneE164
        ? await this.recordActivity(executor, { tenantId: input.tenantId, phoneE164: input.phoneE164, source: "order" , locationId: input.locationId })
        : undefined;
    if (!customer) return;
    await executor.run(
      "UPDATE customers SET order_count=order_count+1,total_spend_paise=total_spend_paise+?,last_order_at=CURRENT_TIMESTAMP,last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?",
      [input.amountPaise, customer.id, input.tenantId],
    );
  }

  setConsent(executor: Executor, input: { tenantId: string; customerId: string; businessId?: string; status: "opted_in" | "opted_out"; source: string }) {
    const now = new Date().toISOString();
    return executor.run(
      `INSERT INTO customer_consents(id,tenant_id,customer_id,channel,purpose,status,consented_at,withdrawn_at,source,consent_text_version,business_id,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(customer_id,channel,purpose) DO UPDATE SET
         status=excluded.status,
         consented_at=CASE WHEN excluded.status='opted_in' THEN excluded.consented_at ELSE customer_consents.consented_at END,
         withdrawn_at=CASE WHEN excluded.status='opted_out' THEN excluded.withdrawn_at ELSE NULL END,
         source=excluded.source,
         consent_text_version=excluded.consent_text_version,
         business_id=excluded.business_id,
         updated_at=excluded.updated_at`,
      [randomUUID(), input.tenantId, input.customerId, "whatsapp", "marketing", input.status, input.status === "opted_in" ? now : null, input.status === "opted_out" ? now : null, input.source, "whatsapp-marketing-v1", input.businessId || null, now],
    );
  }

  async findById(tenantId: string, customerId: string) {
    const customer = await this.db.get<any>(
      `SELECT c.*,cc.status whatsapp_consent_status,cc.consented_at whatsapp_consented_at,cc.withdrawn_at whatsapp_withdrawn_at
       FROM customers c LEFT JOIN customer_consents cc ON cc.customer_id=c.id AND cc.channel='whatsapp' AND cc.purpose='marketing'
       WHERE c.id=? AND c.tenant_id=?`,
      [customerId, tenantId],
    );
    if (!customer) return undefined;
    return { ...customer, display_phone: maskPhone(customer.phone_e164), phone_e164: customer.phone_e164 };
  }

  async list(tenantId: string, query = "", status?: string) {
    const params: unknown[] = [tenantId];
    const conditions = ["c.tenant_id=?"];
    if (query.trim()) { conditions.push("(c.phone_e164 LIKE ? OR c.display_phone LIKE ?)"); params.push(`%${query.trim()}%`, `%${query.trim()}%`); }
    if (status === "opted_in" || status === "opted_out") { conditions.push("cc.status=?"); params.push(status); }
    const rows = await this.db.all<any>(
      `SELECT c.id,c.display_phone,c.first_seen_at,c.last_seen_at,c.last_order_at,c.order_count,c.total_spend_paise,cc.status whatsapp_consent_status
       FROM customers c LEFT JOIN customer_consents cc ON cc.customer_id=c.id AND cc.channel='whatsapp' AND cc.purpose='marketing'
       WHERE ${conditions.join(" AND ")} ORDER BY c.last_seen_at DESC LIMIT 500`,
      params,
    );
    return rows.map((row) => ({ ...row, total_spend_paise: Number(row.total_spend_paise || 0), whatsapp_consent_status: row.whatsapp_consent_status || "not_opted_in" }));
  }

  audience(tenantId: string, audience: any) {
    const conditions = ["c.tenant_id=?", "cc.status='opted_in'"];
    const params: unknown[] = [tenantId];
    if (audience?.segment === "repeat") conditions.push("c.order_count >= 2");
    if (audience?.segment === "new") conditions.push("c.order_count <= 1");
    if (audience?.segment === "inactive") { conditions.push("c.last_seen_at < ?"); params.push(new Date(Date.now() - Number(audience.days || 60) * 86400000).toISOString()); }
    if (audience?.minSpendPaise) { conditions.push("c.total_spend_paise >= ?"); params.push(Number(audience.minSpendPaise)); }
    return this.db.all<any>(
      `SELECT c.id,c.phone_e164,cc.status FROM customers c JOIN customer_consents cc ON cc.customer_id=c.id AND cc.channel='whatsapp' AND cc.purpose='marketing' WHERE ${conditions.join(" AND ")}`,
      params,
    );
  }

  static parseAudience(value: unknown) { return parseJson(value); }
}
