import type { AsyncDatabase, DbTransaction } from "../async-db.js";
import { randomUUID } from "node:crypto";

export class AuthRepository {
  constructor(private readonly db: AsyncDatabase) {}

  findUserByEmail(email: string) {
    return this.db.get<any>("SELECT * FROM users WHERE email=?", [email]);
  }

  findUserBySession(tokenHash: string, now: number) {
    return this.db.get<any>(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?",
      [tokenHash, now],
    );
  }

  async register(user: { id: string; email: string; password: string }, tenant: { id: string; name: string }) {
    await this.db.transaction(async (tx) => {
      await tx.run("INSERT INTO users(id,email,password) VALUES (?,?,?)", [user.id, user.email, user.password]);
      await tx.run("INSERT INTO tenants(id,name) VALUES (?,?)", [tenant.id, tenant.name]);
      await tx.run("INSERT INTO memberships(user_id,tenant_id,role,permissions) VALUES (?,?,?,'{}')", [user.id, tenant.id, "owner"]);
    });
  }

  createSession(db: DbTransaction, tokenHash: string, userId: string, expiresAt: number) {
    return db.run("INSERT INTO sessions VALUES (?,?,?)", [tokenHash, userId, expiresAt]);
  }

  revokeSession(tokenHash: string) {
    return this.db.run("DELETE FROM sessions WHERE token_hash=?", [tokenHash]);
  }

  revokeUserSessions(userId: string, db: DbTransaction = this.db) {
    return db.run("DELETE FROM sessions WHERE user_id=?", [userId]);
  }

  audit(db: DbTransaction, actorId: string, tenantId: string | null, action: string, recordId: string, detail: unknown) {
    return db.run(
      "INSERT INTO audit(id,tenant_id,actor_id,action,record_id,detail) VALUES (?,?,?,?,?,?)",
      [randomUUID(), tenantId, actorId, action, recordId, JSON.stringify(detail)],
    );
  }

  findToken(tokenHash: string, purpose: "reset" | "verify", now: number) {
    return this.db.get<any>(
      "SELECT * FROM email_tokens WHERE token_hash=? AND purpose=? AND expires_at>?",
      [tokenHash, purpose, now],
    );
  }

  createEmailToken(db: DbTransaction, tokenHash: string, userId: string, purpose: "reset" | "verify", expiresAt: number) {
    return db.run("INSERT INTO email_tokens VALUES (?,?,?,?)", [tokenHash, userId, purpose, expiresAt]);
  }

  deleteEmailTokens(db: DbTransaction, userId: string, purpose: "reset" | "verify") {
    return db.run("DELETE FROM email_tokens WHERE user_id=? AND purpose=?", [userId, purpose]);
  }

  deleteEmailToken(tokenHash: string) {
    return this.db.run("DELETE FROM email_tokens WHERE token_hash=?", [tokenHash]);
  }

  updatePassword(db: DbTransaction, userId: string, password: string) {
    return db.run("UPDATE users SET password=? WHERE id=?", [password, userId]);
  }

  markEmailVerified(db: DbTransaction, userId: string) {
    return db.run("UPDATE users SET email_verified=? WHERE id=?", [true, userId]);
  }
}
