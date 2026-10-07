import type { AsyncDatabase, DbTransaction } from "../async-db.js";

export class NotificationRepository {
  constructor(private readonly db: AsyncDatabase) {}

  create(tx: DbTransaction, input: { id: string; locationId: string; title: string; body: string }) {
    return tx.run(
      "INSERT INTO outbox(id,location_id,title,body) VALUES (?,?,?,?)",
      [input.id, input.locationId, input.title, input.body],
    );
  }

  pending(limit = 100) {
    return this.db.all<any>(
      "SELECT * FROM outbox WHERE delivered_at IS NULL AND tries < 10 ORDER BY created_at ASC LIMIT ?",
      [limit],
    );
  }

  markDelivered(tx: DbTransaction, id: string) {
    return tx.run("UPDATE outbox SET delivered_at=CURRENT_TIMESTAMP WHERE id=? AND delivered_at IS NULL", [id]);
  }

  markFailed(tx: DbTransaction, id: string) {
    return tx.run("UPDATE outbox SET tries=tries+1 WHERE id=? AND delivered_at IS NULL", [id]);
  }
}
