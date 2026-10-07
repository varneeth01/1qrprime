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
      "SELECT t.*,u.email FROM tenants t JOIN memberships m ON m.tenant_id=t.id AND m.role='owner' JOIN users u ON u.id=m.user_id WHERE t.name LIKE ? OR u.email LIKE ? LIMIT 100",
      [pattern, pattern],
    );
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
      "INSERT INTO plans VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,entitlements=excluded.entitlements,price_paise=excluded.price_paise",
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
