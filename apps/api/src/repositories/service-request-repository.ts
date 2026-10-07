import type { AsyncDatabase, DbTransaction } from "../async-db.js";

export class ServiceRequestRepository {
  constructor(private readonly db: AsyncDatabase) {}

  create(tx: DbTransaction, input: { id: string; locationId: string; name: string; contact: string; message: string }) {
    return tx.run(
      "INSERT INTO requests(id,location_id,name,contact,message) VALUES (?,?,?,?,?)",
      [input.id, input.locationId, input.name, input.contact, input.message],
    );
  }

  list(locationId: string) {
    return this.db.all<any>(
      "SELECT * FROM requests WHERE location_id=? ORDER BY created_at DESC LIMIT 200",
      [locationId],
    );
  }

  close(tx: DbTransaction, requestId: string, locationId: string) {
    return tx.run(
      "UPDATE requests SET state='closed' WHERE id=? AND location_id=?",
      [requestId, locationId],
    );
  }
}
