import type { AsyncDatabase, DbTransaction } from "../async-db.js";
export type ServiceType = "WAITER" | "WATER" | "CUTLERY" | "BILL";

export class ServiceRequestRepository {
  constructor(private readonly db: AsyncDatabase) {}

  async createService(tx: DbTransaction, input: { id: string; publicToken: string; tenantId: string; locationId: string; tableId: string; orderId?: string; type: ServiceType; quantity: number }) {
    const active = await tx.get<any>("SELECT * FROM service_requests WHERE location_id=? AND table_id=? AND type=? AND status IN ('NEW','ACKNOWLEDGED') ORDER BY created_at DESC LIMIT 1", [input.locationId, input.tableId, input.type]);
    if (active) return { request: active, created: false };
    await tx.run("INSERT INTO service_requests(id,public_token,tenant_id,location_id,table_id,order_id,type,quantity) VALUES (?,?,?,?,?,?,?,?)", [input.id, input.publicToken, input.tenantId, input.locationId, input.tableId, input.orderId || null, input.type, input.quantity]);
    return { request: await tx.get<any>("SELECT * FROM service_requests WHERE id=?", [input.id]), created: true };
  }

  getByToken(token: string) { return this.db.get<any>("SELECT * FROM service_requests WHERE public_token=?", [token]); }
  listService(locationId: string) { return this.db.all<any>("SELECT r.*,t.name table_name,u.email assigned_staff_email FROM service_requests r JOIN restaurant_tables t ON t.id=r.table_id LEFT JOIN users u ON u.id=r.assigned_staff_id WHERE r.location_id=? ORDER BY CASE r.status WHEN 'NEW' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,r.created_at DESC LIMIT 200", [locationId]); }
  acknowledge(tx: DbTransaction, requestId: string, locationId: string, staffId: string) { return tx.run("UPDATE service_requests SET status='ACKNOWLEDGED',assigned_staff_id=?,acknowledged_at=COALESCE(acknowledged_at,CURRENT_TIMESTAMP) WHERE id=? AND location_id=? AND status='NEW'", [staffId, requestId, locationId]); }
  complete(tx: DbTransaction, requestId: string, locationId: string, staffId: string) { return tx.run("UPDATE service_requests SET status='COMPLETED',assigned_staff_id=COALESCE(assigned_staff_id,?),completed_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=? AND status='ACKNOWLEDGED'", [staffId, requestId, locationId]); }
  activeOrderForTable(tableId: string, locationId: string) { return this.db.get<any>("SELECT * FROM orders WHERE table_id=? AND location_id=? AND state NOT IN ('completed','cancelled','rejected') ORDER BY created_at DESC LIMIT 1", [tableId, locationId]); }

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
