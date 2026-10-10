import type { AsyncDatabase, DbTransaction } from "../async-db.js";
import { randomUUID } from "node:crypto";

export class AdminRepository {
  constructor(private readonly db: AsyncDatabase) {}

  auditList(tenantId: string) {
    return this.db.all<any>("SELECT * FROM audit WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200", [tenantId]);
  }

  ownedTenantIds(userId: string) {
    return this.db.all<{ tenant_id: string }>("SELECT tenant_id FROM memberships WHERE user_id=? AND role='owner'", [userId]);
  }

  locationsForTenant(tenantId: string) {
    return this.db.all<any>("SELECT * FROM locations WHERE tenant_id=? ORDER BY name", [tenantId]);
  }

  accounts(query: string) {
    const pattern = `%${query}%`;
    return this.db.all<any>(
      "SELECT t.*,u.id owner_id,u.email,u.email_verified,u.created_at owner_created_at,u.last_login_at,u.last_active_at,p.name plan_name,p.price_paise plan_price_paise FROM tenants t JOIN memberships m ON m.tenant_id=t.id AND m.role='owner' JOIN users u ON u.id=m.user_id JOIN plans p ON p.id=t.plan_id WHERE t.name LIKE ? OR u.email LIKE ? LIMIT 100",
      [pattern, pattern],
    );
  }

  accountDetail(tenantId: string) {
    return Promise.all([
      this.db.get<any>("SELECT t.*,p.name plan_name,p.price_paise plan_price_paise,p.original_price_paise plan_original_price_paise,p.currency plan_currency,p.max_staff plan_max_staff,p.entitlements FROM tenants t JOIN plans p ON p.id=t.plan_id WHERE t.id=?", [tenantId]),
      this.db.all<any>("SELECT id,name,category,public_id,slug,profile,published,status FROM locations WHERE tenant_id=? ORDER BY name", [tenantId]),
      this.db.all<any>("SELECT u.id,u.email,m.role,m.permissions,u.last_active_at FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? ORDER BY u.email", [tenantId]),
      this.db.all<any>("SELECT id,created_at,success,client_type,platform,ip_address,user_agent FROM login_events WHERE user_id IN (SELECT user_id FROM memberships WHERE tenant_id=?) ORDER BY created_at DESC LIMIT 50", [tenantId]),
      this.db.all<any>("SELECT id,provider,provider_order_id,provider_payment_id,amount_paise,currency,status,created_at,verified_at FROM billing_payments WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50", [tenantId]),
    ]);
  }

  plans() {
    return this.db.all<any>("SELECT * FROM plans ORDER BY id");
  }

  tenantExists(id: string) {
    return this.db.get("SELECT 1 FROM tenants WHERE id=?", [id]);
  }

  planExists(id: string) {
    return this.db.get("SELECT 1 FROM plans WHERE id=?", [id]);
  }

  updatePlan(tx: DbTransaction, id: string, input: { name: string; entitlements: string; pricePaise: number | null }) {
    return tx.run(
      "INSERT INTO plans(id,name,entitlements,price_paise) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,entitlements=excluded.entitlements,price_paise=excluded.price_paise",
      [id, input.name, input.entitlements, input.pricePaise],
    );
  }

  tenantReports(tenantId: string) {
    return this.db.all<any>("SELECT r.* FROM reports r JOIN locations l ON l.id=r.location_id WHERE l.tenant_id=? ORDER BY r.created_at DESC", [tenantId]);
  }

  supportNotes(tenantId: string) {
    return this.db.all<any>("SELECT * FROM support_notes WHERE tenant_id=? ORDER BY created_at DESC", [tenantId]);
  }

  createSupportNote(tx: DbTransaction, input: { id: string; tenantId: string; actorId: string; note: string }) {
    return tx.run("INSERT INTO support_notes VALUES (?,?,?,?,CURRENT_TIMESTAMP)", [input.id, input.tenantId, input.actorId, input.note]);
  }

  updateBilling(tx: DbTransaction, tenantId: string, planId: string, state: string) {
    return tx.run("UPDATE tenants SET plan_id=?,billing_state=? WHERE id=?", [planId, state, tenantId]);
  }

  salesLeads(status?: string) {
    return this.db.all<any>(
      status ? "SELECT * FROM sales_leads WHERE status=? ORDER BY created_at DESC LIMIT 200" : "SELECT * FROM sales_leads ORDER BY created_at DESC LIMIT 200",
      status ? [status] : [],
    );
  }

  billingPayments(filters: { status?: string; query?: string } = {}) {
    const clauses = ["1=1"];
    const params: string[] = [];
    if (filters.status) { clauses.push("bp.status=?"); params.push(filters.status); }
    if (filters.query) {
      clauses.push("(u.email LIKE ? OR t.name LIKE ? OR EXISTS (SELECT 1 FROM locations search_l WHERE search_l.tenant_id=bp.tenant_id AND search_l.name LIKE ?) OR bp.provider_order_id LIKE ?)");
      const pattern = `%${filters.query}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    return this.db.all<any>(
      `SELECT bp.id,bp.provider,bp.provider_order_id,bp.provider_payment_id,bp.amount_paise,bp.currency,bp.status,bp.created_at,bp.verified_at,
        u.email,t.name tenant_name,
        (SELECT l.name FROM locations l WHERE l.tenant_id=bp.tenant_id ORDER BY l.id LIMIT 1) business_name,
        (SELECT l.category FROM locations l WHERE l.tenant_id=bp.tenant_id ORDER BY l.id LIMIT 1) category,
        p.name plan_name
       FROM billing_payments bp
       JOIN users u ON u.id=bp.user_id
       JOIN tenants t ON t.id=bp.tenant_id
       JOIN plans p ON p.id=bp.plan_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY bp.created_at DESC LIMIT 200`,
      params,
    );
  }

  salesLead(id: string) {
    return this.db.get<any>("SELECT * FROM sales_leads WHERE id=?", [id]);
  }

  updateSalesLead(tx: DbTransaction, id: string, status: string, notes: string | null) {
    return tx.run("UPDATE sales_leads SET status=?,notes=COALESCE(?,notes),updated_at=CURRENT_TIMESTAMP WHERE id=?", [status, notes, id]);
  }

  getReport(id: string) {
    return this.db.get<any>("SELECT r.*,l.tenant_id FROM reports r JOIN locations l ON l.id=r.location_id WHERE r.id=?", [id]);
  }

  resolveReport(tx: DbTransaction, id: string, locationId: string | null, unpublish: boolean) {
    return tx.run("UPDATE reports SET state='resolved' WHERE id=?", [id]).then(async (result) => {
      if (unpublish && locationId)
        await tx.run("UPDATE locations SET published=FALSE WHERE id=?", [locationId]);
      return result;
    });
  }

  createReport(tx: DbTransaction, input: { id: string; locationId: string; message: string }) {
    return tx.run("INSERT INTO reports(id,location_id,message) VALUES (?,?,?)", [input.id, input.locationId, input.message]);
  }

  async deleteAccount(tx: DbTransaction, userId: string) {
    const owned = await this.ownedTenantIdsWithExecutor(tx, userId);
    for (const tenant of owned) {
      await tx.run("INSERT INTO audit(id,tenant_id,actor_id,action,record_id,detail) VALUES (?,?,?,?,?,?)", [
        randomUUID(),
        tenant.tenant_id,
        userId,
        "account.deleted",
        userId,
        JSON.stringify({ policy: "Active tenant records removed; restricted audit retained" }),
      ]);
      await tx.run("DELETE FROM tenants WHERE id=?", [tenant.tenant_id]);
    }
    await tx.run("DELETE FROM users WHERE id=?", [userId]);
  }

  private ownedTenantIdsWithExecutor(executor: DbTransaction, userId: string) {
    return executor.all<{ tenant_id: string }>("SELECT tenant_id FROM memberships WHERE user_id=? AND role='owner'", [userId]);
  }
}
