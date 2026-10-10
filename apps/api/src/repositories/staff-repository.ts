import type { AsyncDatabase, DbTransaction } from "../async-db.js";

export class StaffRepository {
  constructor(private readonly db: AsyncDatabase) {}

  list(tenantId: string) {
    return this.db.all<any>(
      "SELECT u.id,u.email,m.role,m.permissions,u.last_active_at FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? ORDER BY u.email",
      [tenantId],
    );
  }

  listInvitations(tenantId: string) {
    return this.db.all<any>(
      "SELECT id,email,name,role,permissions,expires_at,accepted_at,revoked_at,created_at FROM staff_invitations WHERE tenant_id=? ORDER BY created_at DESC",
      [tenantId],
    );
  }

  invitation(tokenHash: string) {
    return this.db.get<any>("SELECT * FROM staff_invitations WHERE token_hash=?", [tokenHash]);
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

  upsert(tx: DbTransaction, userId: string, tenantId: string, role: "manager" | "staff", permissions = "{}") {
    return tx.run(
      "INSERT INTO memberships(user_id,tenant_id,role,permissions) VALUES (?,?,?,?) ON CONFLICT(user_id,tenant_id) DO UPDATE SET role=excluded.role,permissions=excluded.permissions",
      [userId, tenantId, role, permissions],
    );
  }

  remove(tx: DbTransaction, userId: string, tenantId: string) {
    return tx.run(
      "DELETE FROM memberships WHERE user_id=? AND tenant_id=? AND role!='owner'",
      [userId, tenantId],
    );
  }
}
