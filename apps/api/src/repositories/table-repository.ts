import type { AsyncDatabase, DbTransaction } from "../async-db.js";

export class TableRepository {
  constructor(private readonly db: AsyncDatabase) {}

  list(locationId: string) {
    return this.db.all<any>("SELECT * FROM restaurant_tables WHERE location_id=? ORDER BY enabled DESC,name", [locationId]);
  }

  get(id: string, locationId: string) {
    return this.db.get<any>("SELECT * FROM restaurant_tables WHERE id=? AND location_id=?", [id, locationId]);
  }

  getEnabledByToken(locationId: string, token: string) {
    return this.db.get<any>("SELECT id,name,public_token FROM restaurant_tables WHERE location_id=? AND public_token=? AND enabled=TRUE", [locationId, token]);
  }

  create(tx: DbTransaction, input: { id: string; locationId: string; name: string; publicToken: string }) {
    return tx.run("INSERT INTO restaurant_tables(id,location_id,name,public_token) VALUES (?,?,?,?)", [input.id, input.locationId, input.name, input.publicToken]);
  }

  update(tx: DbTransaction, id: string, locationId: string, input: { name: string; enabled: boolean }) {
    return tx.run("UPDATE restaurant_tables SET name=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=?", [input.name, input.enabled, id, locationId]);
  }

  archive(tx: DbTransaction, id: string, locationId: string) {
    return tx.run("UPDATE restaurant_tables SET enabled=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=?", [id, locationId]);
  }

  history(locationId: string, tableId: string) {
    return this.db.all<any>("SELECT * FROM orders WHERE location_id=? AND table_id=? ORDER BY created_at DESC LIMIT 100", [locationId, tableId]);
  }
}
