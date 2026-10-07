import type { AsyncDatabase, DbTransaction } from "../async-db.js";

export class StaffRepository {
  constructor(private readonly db: AsyncDatabase) {}

  list(tenantId: string) {
    return this.db.all<any>(
      "SELECT u.id,u.email,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? ORDER BY u.email",
      [tenantId],
    );
  }

  findUserByEmail(email: string) {
    return this.db.get<any>("SELECT id FROM users WHERE email=?", [email]);
  }

  membership(userId: string, tenantId: string) {
    return this.db.get<any>("SELECT role FROM memberships WHERE user_id=? AND tenant_id=?", [userId, tenantId]);
  }

  countNonOwners(tenantId: string) {
    return this.db.get<{ n: number }>("SELECT count(*) n FROM memberships WHERE tenant_id=? AND role!='owner'", [tenantId]);
  }

  upsert(tx: DbTransaction, userId: string, tenantId: string, role: "manager" | "staff") {
    return tx.run(
      "INSERT INTO memberships VALUES (?,?,?) ON CONFLICT(user_id,tenant_id) DO UPDATE SET role=excluded.role",
      [userId, tenantId, role],
    );
  }

  remove(tx: DbTransaction, userId: string, tenantId: string) {
    return tx.run(
      "DELETE FROM memberships WHERE user_id=? AND tenant_id=? AND role!='owner'",
      [userId, tenantId],
    );
  }
}
