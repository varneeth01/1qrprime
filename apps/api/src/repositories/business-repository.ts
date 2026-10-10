import type { AsyncDatabase, DbTransaction } from "../async-db.js";

export class BusinessRepository {
  constructor(private readonly db: AsyncDatabase) {}

  listForUser(userId: string) {
    return Promise.all([
      this.db.all<any>("SELECT t.*,m.role FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE m.user_id=?", [userId]),
      this.db.all<any>("SELECT l.*,m.role FROM locations l JOIN memberships m ON m.tenant_id=l.tenant_id WHERE m.user_id=?", [userId]),
    ]);
  }

  countLocations(tenantId: string) {
    return this.db.get<{ n: number }>("SELECT count(*) n FROM locations WHERE tenant_id=?", [tenantId]);
  }

  slugExists(slug: string) {
    return this.db.get("SELECT 1 FROM locations WHERE slug=?", [slug]);
  }

  createLocation(tx: DbTransaction, location: Record<string, unknown>) {
    return tx.run(
      "INSERT INTO locations(id,tenant_id,slug,public_id,name,category,profile,status,onboarding_step,onboarding_completed) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [location.id, location.tenantId, location.slug, location.publicId, location.name, location.category, location.profile, location.status, location.onboardingStep, location.onboardingCompleted],
    );
  }

  getLocation(id: string) {
    return this.db.get<any>("SELECT * FROM locations WHERE id=?", [id]);
  }

  getMembership(userId: string, tenantId: string) {
    return this.db.get<any>("SELECT role,permissions FROM memberships WHERE user_id=? AND tenant_id=?", [userId, tenantId]);
  }

  updatePublished(tx: DbTransaction, input: { id: string; name: string; category: string; profile: string; published: boolean; status: string; completed: boolean; version: number }) {
    return tx.run(
      "UPDATE locations SET name=?,category=?,profile=?,published=?,status=?,onboarding_completed=CASE WHEN ? THEN TRUE ELSE onboarding_completed END,version=version+1 WHERE id=? AND version=?",
      [input.name, input.category, input.profile, input.published, input.status, input.completed, input.id, input.version],
    );
  }

  saveOnboarding(tx: DbTransaction, input: { id: string; name: string | null; category: string | null; profile: string; step: number; completed: boolean }) {
    return tx.run(
      "UPDATE locations SET name=COALESCE(?,name),category=COALESCE(?,category),profile=?,onboarding_step=?,onboarding_completed=CASE WHEN ? THEN TRUE ELSE onboarding_completed END WHERE id=?",
      [input.name, input.category, input.profile, input.step, input.completed, input.id],
    );
  }
}
