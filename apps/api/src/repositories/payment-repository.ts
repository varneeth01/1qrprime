import type { AsyncDatabase, DbTransaction } from "../async-db.js";
import { basicUpi } from "../domain.js";
import { randomUUID } from "node:crypto";

const httpError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });

function parseSnapshot(value: unknown) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function normalizeAttempt(row: any) {
  if (!row) return row;
  return {
    ...row,
    amount_paise: row.amount_paise == null ? row.amount_paise : Number(row.amount_paise),
    snapshot: parseSnapshot(row.snapshot),
  };
}

export class PaymentRepository {
  constructor(private readonly db: AsyncDatabase) {}

  listRoutes(locationId: string) {
    return this.db.all<any>("SELECT * FROM routes WHERE location_id=? ORDER BY id", [locationId]);
  }

  listRoutesForTenant(tenantId: string) {
    return this.db.all<any>(
      "SELECT r.*,l.name location_name FROM routes r JOIN locations l ON l.id=r.location_id WHERE l.tenant_id=? ORDER BY l.name,r.id",
      [tenantId],
    );
  }

  createRoute(tx: DbTransaction, input: { id: string; locationId: string; label: string; vpa: string; payee: string }) {
    return tx.run(
      "INSERT INTO routes(id,location_id,label,provider,vpa,payee,state) VALUES (?,?,?,'basic_upi',?,?,'draft')",
      [input.id, input.locationId, input.label, input.vpa, input.payee],
    );
  }

  requestVerification(tx: DbTransaction, id: string, locationId: string, evidence: string) {
    return tx.run(
      "UPDATE routes SET state='verification_pending',evidence=? WHERE id=? AND location_id=? AND state='draft'",
      [evidence, id, locationId],
    );
  }

  getActivatableRoute(id: string, locationId: string) {
    return this.db.get<any>(
      "SELECT * FROM routes WHERE id=? AND location_id=? AND state IN ('verified','active') AND verified_at IS NOT NULL",
      [id, locationId],
    );
  }

  async activate(tx: DbTransaction, locationId: string, currentRouteId: string | null, routeId: string) {
    const route = await tx.get<any>(
      "SELECT * FROM routes WHERE id=? AND location_id=? AND state IN ('verified','active') AND verified_at IS NOT NULL",
      [routeId, locationId],
    );
    if (!route) throw httpError(409, "Only verified routes can be activated");
    if (currentRouteId === routeId) return route;
    if (currentRouteId)
      await tx.run("UPDATE routes SET state='verified' WHERE id=? AND location_id=? AND state='active'", [currentRouteId, locationId]);
    await tx.run("UPDATE routes SET state='active' WHERE id=? AND location_id=?", [routeId, locationId]);
    await tx.run("UPDATE locations SET previous_route_id=active_route_id,active_route_id=? WHERE id=?", [routeId, locationId]);
    return route;
  }

  disable(tx: DbTransaction, id: string, locationId: string) {
    return tx.run("UPDATE routes SET state='disabled' WHERE id=? AND location_id=?", [id, locationId]);
  }

  getRoute(id: string) {
    return this.db.get<any>("SELECT r.*,l.tenant_id FROM routes r JOIN locations l ON l.id=r.location_id WHERE r.id=?", [id]);
  }

  verify(tx: DbTransaction, id: string, actorId: string, evidence: string) {
    return tx.run(
      "UPDATE routes SET state='verified',verified_by=?,verified_at=CURRENT_TIMESTAMP,evidence=? WHERE id=? AND state='verification_pending'",
      [actorId, evidence, id],
    );
  }

  async getAttempt(locationId: string, idempotencyKey: string) {
    return normalizeAttempt(await this.db.get<any>(
      "SELECT * FROM attempts WHERE location_id=? AND idempotency_key=?",
      [locationId, idempotencyKey],
    ));
  }

  /** Creates or safely reuses a payment attempt. Order-linked amounts are read from the order. */
  async createAttempt(input: {
    locationId: string;
    activeRouteId: string | null;
    idempotencyKey: string;
    orderId?: string;
    amountPaise?: number;
  }) {
    try {
      return await this.db.transaction(async (tx) => {
        const existing = normalizeAttempt(await tx.get<any>(
          "SELECT * FROM attempts WHERE location_id=? AND idempotency_key=?",
          [input.locationId, input.idempotencyKey],
        ));
        if (existing) {
          if ((existing.order_id ?? null) !== (input.orderId ?? null))
            throw httpError(409, "Payment retry key conflict");
          return { id: existing.id, state: existing.state, snapshot: existing.snapshot };
        }

        let authoritativeAmount = input.amountPaise;
        if (input.orderId) {
          const order = await tx.get<any>(
            "SELECT id,location_id,amount_paise,state,payment_state FROM orders WHERE id=?",
            [input.orderId],
          );
          if (!order || order.location_id !== input.locationId)
            throw httpError(403, "Order does not belong to this business");
          if (["rejected", "cancelled", "completed"].includes(order.state) || order.payment_state !== "pending")
            throw httpError(409, "Order is not payable");
          authoritativeAmount = Number(order.amount_paise);
        }
        if (authoritativeAmount != null && (!Number.isInteger(authoritativeAmount) || authoritativeAmount <= 0 || authoritativeAmount > 100000000))
          throw httpError(400, "Invalid payment amount");

        const route = await tx.get<any>(
          "SELECT * FROM routes WHERE id=? AND location_id=? AND state='active'",
          [input.activeRouteId, input.locationId],
        );
        if (!route) throw httpError(409, "No verified active payment route");

        const attemptId = randomUUID();
        const reference = input.orderId || attemptId;
        const created = basicUpi.create({
          vpa: route.vpa,
          payee: route.payee,
          amountPaise: authoritativeAmount,
          reference,
        });
        const snapshot = {
          routeId: route.id,
          provider: route.provider,
          vpa: route.vpa,
          payee: route.payee,
          ...created,
          amountPaise: authoritativeAmount,
          reference,
        };
        await tx.run(
          "INSERT INTO attempts(id,location_id,order_id,idempotency_key,route_id,snapshot,amount_paise,state) VALUES (?,?,?,?,?,?,?,'confirmation_pending')",
          [attemptId, input.locationId, input.orderId ?? null, input.idempotencyKey, route.id, JSON.stringify(snapshot), authoritativeAmount ?? null],
        );
        await tx.run(
          "INSERT INTO events(location_id,day,kind,count) VALUES (?,date('now'),?,1) ON CONFLICT(location_id,day,kind) DO UPDATE SET count=events.count+1",
          [input.locationId, "payment_attempt"],
        );
        return { id: attemptId, state: created.state, snapshot };
      });
    } catch (error: any) {
      // A concurrent retry may win the unique (location_id, idempotency_key)
      // constraint. Resolve it to the same logical attempt after rollback.
      if (error?.code === "23505" || /unique constraint|UNIQUE constraint/i.test(String(error?.message))) {
        const existing = await this.getAttempt(input.locationId, input.idempotencyKey);
        if (existing) {
          if ((existing.order_id ?? null) !== (input.orderId ?? null))
            throw httpError(409, "Payment retry key conflict");
          return { id: existing.id, state: existing.state, snapshot: existing.snapshot };
        }
      }
      throw error;
    }
  }

  confirmOrderPayment(tx: DbTransaction, orderId: string, locationId: string) {
    return tx.run(
      "UPDATE orders SET payment_state='merchant_confirmed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=? AND payment_state='pending'",
      [orderId, locationId],
    );
  }
}
