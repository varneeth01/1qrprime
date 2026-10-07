import type { AsyncDatabase, DbTransaction } from "../async-db.js";

/** Public/customer-facing business reads. Keep sensitive merchant fields out of this boundary. */
export class CustomerPageRepository {
  constructor(private readonly db: AsyncDatabase) {}

  getPublishedBusiness(slugOrPublicId: string) {
    return this.db.get<any>(
      "SELECT id,tenant_id,public_id,slug,name,category,profile,published,status,active_route_id FROM locations WHERE (slug=? OR public_id=?) AND published=TRUE",
      [slugOrPublicId, slugOrPublicId],
    );
  }

  getActivePaymentRoute(locationId: string, routeId: string | null | undefined) {
    if (!routeId) return Promise.resolve(undefined);
    return this.db.get<any>(
      "SELECT id,label,provider,vpa,payee,state FROM routes WHERE id=? AND location_id=? AND state='active'",
      [routeId, locationId],
    );
  }

  /** Used by tests and future customer-page repository writes that need atomicity. */
  updatePublishedProfile(
    tx: DbTransaction,
    input: { id: string; profile: string; version: number },
  ) {
    return tx.run(
      "UPDATE locations SET profile=?,version=version+1 WHERE id=? AND version=?",
      [input.profile, input.id, input.version],
    );
  }
}
