import type { AsyncDatabase, DbTransaction } from "../async-db.js";

export class AnalyticsRepository {
  constructor(private readonly db: AsyncDatabase) {}

  record(executor: DbTransaction, locationId: string, kind: string) {
    return executor.run(
      "INSERT INTO events(location_id,day,kind,count) VALUES (?,date('now'),?,1) ON CONFLICT(location_id,day,kind) DO UPDATE SET count=events.count+1",
      [locationId, kind],
    );
  }

  list(locationId: string) {
    return this.db.all<any>(
      "SELECT day,kind,count FROM events WHERE location_id=? ORDER BY day DESC LIMIT 365",
      [locationId],
    );
  }
}
