import { randomUUID } from "node:crypto";
import type { DbTransaction, AsyncDatabase } from "../async-db.js";

const error = (statusCode: number, message: string, appCode?: string) => Object.assign(new Error(message), { statusCode, appCode });
const parse = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;

export class OrderOperationsRepository {
  constructor(private readonly db: AsyncDatabase) {}

  async cancelItem(tx: DbTransaction, input: { id: string; locationId: string; tenantId: string; orderId: string; itemId: string; quantity: number; idempotencyKey: string; actorId: string; actorRole: string; reason: string; note: string; override: boolean }) {
    const prior = await tx.get<any>("SELECT response_json FROM item_cancellation_idempotency WHERE location_id=? AND idempotency_key=?", [input.locationId, input.idempotencyKey]);
    if (prior) return { ...parse(prior.response_json), idempotent: true };
    const order = await tx.get<any>("SELECT * FROM orders WHERE id=? AND location_id=?", [input.orderId, input.locationId]);
    if (!order) throw error(404, "Order not found");
    if (["rejected", "cancelled", "closed"].includes(order.state)) throw error(409, "Order is no longer editable");
    const item = await tx.get<any>("SELECT * FROM order_items WHERE id=? AND order_id=?", [input.itemId, input.orderId]);
    if (!item) throw error(404, "Order item not found");
    const remaining = Number(item.quantity) - Number(item.cancelled_quantity || 0);
    if (input.quantity > remaining) throw error(409, "That item quantity is already cancelled");
    const paid = ["paid", "verified", "captured"].includes(String(order.payment_state).toLowerCase());
    if (paid && !input.override) throw error(409, "Payment already completed. Ask a manager to cancel/refund this item.", "PAYMENT_ALREADY_COMPLETED");
    const deadline = item.cancellable_until ? new Date(item.cancellable_until).getTime() : new Date(order.created_at).getTime() + 5 * 60_000;
    if (!input.override && Date.now() >= deadline) throw error(409, "This item's cancellation window has ended. Ask a manager for help.", "ITEM_CANCELLATION_LOCKED");
    if (input.override && !input.reason.trim()) throw error(400, "A cancellation reason is required");
    const updated = await tx.run("UPDATE order_items SET cancelled_quantity=cancelled_quantity+?,cancelled_at=CURRENT_TIMESTAMP,cancelled_by=?,cancellation_reason=? WHERE id=? AND order_id=? AND quantity-cancelled_quantity>=?", [input.quantity, input.actorId, input.reason, input.itemId, input.orderId, input.quantity]);
    if (updated.rowCount !== 1) throw error(409, "That item changed. Refresh and try again.", "ITEM_CANCELLATION_CONFLICT");
    const allItems = await tx.all<any>("SELECT * FROM order_items WHERE order_id=? ORDER BY rowid", [input.orderId]);
    const activeGross = allItems.reduce((sum, line) => sum + (Number(line.quantity) - Number(line.cancelled_quantity || 0)) * Number(line.unit_price_snapshot), 0);
    const discount = Math.min(activeGross, Number(order.discount_paise || 0));
    const taxable = Math.max(0, activeGross - discount);
    const tax = order.tax_paise && Number(order.tax_paise) > 0 && Number(order.amount_paise) > 0
      ? Math.round(taxable * Number(order.tax_paise) / Math.max(1, Number(order.amount_paise) - Number(order.tax_paise) - Number(order.packaging_fee_paise || 0) - Number(order.service_fee_paise || 0) - Number(order.delivery_fee_paise || 0) + Number(order.discount_paise || 0)))
      : 0;
    const newAmount = taxable + tax + Number(order.packaging_fee_paise || 0) + Number(order.service_fee_paise || 0) + Number(order.delivery_fee_paise || 0);
    const lines = parse(order.lines) as any[];
    const nextLines = lines.map((line) => line.itemId === item.menu_item_id ? { ...line, cancelledQuantity: Math.min(Number(line.quantity), Number(line.cancelledQuantity || 0) + input.quantity) } : line);
    if (!paid) await tx.run("UPDATE orders SET amount_paise=?,discount_paise=?,tax_paise=?,lines=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=?", [newAmount, discount, tax, JSON.stringify(nextLines), input.orderId, input.locationId]);
    await tx.run("INSERT INTO order_events(id,order_id,state,actor_id,reason) VALUES (?,?,?,?,?)", [randomUUID(), input.orderId, "item_cancelled", input.actorId, `${input.quantity} × ${item.item_name_snapshot}: ${input.reason}`]);
    let refund: any = null;
    if (paid) {
      const grossBefore = allItems.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price_snapshot), 0);
      const amount = Math.min(Number(order.amount_paise), Math.max(0, Math.round(Number(item.unit_price_snapshot) * input.quantity * Number(order.amount_paise) / Math.max(1, grossBefore))));
      const refundId = randomUUID();
      await tx.run("INSERT INTO refunds(id,tenant_id,location_id,order_id,order_item_id,amount_paise,status,reason,note,requested_by) VALUES (?,?,?,?,?,?,'MANUAL_REQUIRED',?,?,?)", [refundId, input.tenantId, input.locationId, input.orderId, input.itemId, amount, input.reason, input.note || "", input.actorId]);
      refund = { id: refundId, amountPaise: amount, status: "MANUAL_REQUIRED" };
    }
    const response = { ok: true, orderId: input.orderId, itemId: input.itemId, itemName: item.item_name_snapshot, tableName: order.table_name_snapshot, cancelledQuantity: input.quantity, override: input.override, refund };
    await tx.run("INSERT INTO item_cancellation_idempotency(id,location_id,order_id,idempotency_key,response_json) VALUES (?,?,?,?,?)", [input.id, input.locationId, input.orderId, input.idempotencyKey, JSON.stringify(response)]);
    return response;
  }

  async completeManualRefund(tx: DbTransaction, input: { locationId: string; orderId: string; refundId: string; actorId: string; note: string }) {
    const refund = await tx.get<any>("SELECT * FROM refunds WHERE id=? AND order_id=? AND location_id=?", [input.refundId, input.orderId, input.locationId]);
    if (!refund) throw error(404, "Refund not found");
    if (refund.status !== "MANUAL_REQUIRED") throw error(409, "Refund is no longer awaiting manual completion");
    await tx.run("UPDATE refunds SET status='SUCCEEDED',approved_by=?,note=?,processed_at=CURRENT_TIMESTAMP WHERE id=? AND status='MANUAL_REQUIRED'", [input.actorId, input.note || refund.note, input.refundId]);
    const order = await tx.get<any>("SELECT * FROM orders WHERE id=? AND location_id=?", [input.orderId, input.locationId]);
    const items = await tx.all<any>("SELECT * FROM order_items WHERE order_id=?", [input.orderId]);
    const activeGross = items.reduce((sum, line) => sum + (Number(line.quantity) - Number(line.cancelled_quantity || 0)) * Number(line.unit_price_snapshot), 0);
    const discount = Math.min(activeGross, Number(order.discount_paise || 0));
    const taxable = Math.max(0, activeGross - discount);
    const tax = Number(order.tax_paise || 0);
    const newAmount = taxable + tax + Number(order.packaging_fee_paise || 0) + Number(order.service_fee_paise || 0) + Number(order.delivery_fee_paise || 0);
    await tx.run("UPDATE orders SET amount_paise=?,discount_paise=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=?", [newAmount, discount, input.orderId, input.locationId]);
    return { ok: true, refundId: input.refundId, status: "SUCCEEDED", amountPaise: Number(refund.amount_paise) };
  }

  async metrics(locationId: string, fromIso: string) {
    const orders = await this.db.all<any>("SELECT * FROM orders WHERE location_id=? AND created_at>=? ORDER BY created_at DESC", [locationId, fromIso]);
    const duration = (a: any, b: any) => a && b ? Math.max(0, new Date(b).getTime() - new Date(a).getTime()) : null;
    const avg = (values: Array<number | null>) => { const usable = values.filter((v): v is number => v != null); return usable.length ? Math.round(usable.reduce((a, b) => a + b, 0) / usable.length) : null; };
    const served = orders.filter((o) => ["served", "completed", "closed"].includes(o.state) || o.served_at);
    const completed = orders.filter((o) => ["completed", "closed"].includes(o.state));
    const tableGroups = new Map<string, any[]>();
    for (const order of completed) if (order.table_id) tableGroups.set(order.table_id, [...(tableGroups.get(order.table_id) || []), order]);
    const sessions = [...tableGroups.values()].map((rows) => ({ duration: duration(rows.reduce((a, x) => a < x.created_at ? a : x.created_at, rows[0].created_at), rows.map((x) => x.closed_at).filter(Boolean).sort().at(-1)), spend: rows.reduce((sum, x) => sum + Number(x.amount_paise || 0), 0) }));
    return { orders: orders.length, ordersServed: served.length, revenuePaise: completed.reduce((sum, x) => sum + Number(x.amount_paise || 0), 0), averageOrderValuePaise: completed.length ? Math.round(completed.reduce((sum, x) => sum + Number(x.amount_paise || 0), 0) / completed.length) : 0, averageQueueMs: avg(orders.map((o) => duration(o.created_at, o.preparation_started_at))), averagePreparationMs: avg(orders.map((o) => duration(o.preparation_started_at, o.ready_at))), averageServiceHandoffMs: avg(orders.map((o) => duration(o.ready_at, o.served_at))), averageFulfillmentMs: avg(orders.map((o) => duration(o.created_at, o.served_at))), averageTableDurationMs: avg(sessions.map((s) => s.duration)), averageSpendPerHourPaise: avg(sessions.filter((s) => s.duration).map((s) => Math.round(s.spend / (s.duration! / 3_600_000)))), slowOrders: orders.filter((o) => ["preparing", "ready"].includes(o.state)).sort((a, b) => new Date(a.preparation_started_at || a.ready_at || a.created_at).getTime() - new Date(b.preparation_started_at || b.ready_at || b.created_at).getTime()).slice(-5).map((o) => ({ id: o.id, publicOrderNumber: o.public_order_number, tableName: o.table_name_snapshot, state: o.state, ageMs: Date.now() - new Date(o.preparation_started_at || o.ready_at || o.created_at).getTime() })) };
  }
}
