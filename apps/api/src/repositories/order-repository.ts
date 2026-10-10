import { randomBytes, randomUUID } from "node:crypto";
import type { AsyncDatabase, DbTransaction } from "../async-db.js";
import { transitions } from "../domain.js";

type DbExecutor = AsyncDatabase | DbTransaction;

const token = () => randomBytes(32).toString("hex");
const id = () => randomUUID();
const uniqueViolation = (error: any) => error?.code === "23505" || /unique constraint|UNIQUE constraint/i.test(String(error?.message));

export class OrderRepository {
  constructor(private readonly db: AsyncDatabase) {}

  getById(id: string, locationId?: string, executor: DbExecutor = this.db) {
    return executor.get<any>(
      `SELECT * FROM orders WHERE id=?${locationId ? " AND location_id=?" : ""}`,
      locationId ? [id, locationId] : [id],
    );
  }

  getByIdempotency(locationId: string, idempotencyKey: string, executor: DbExecutor = this.db) {
    return executor.get<any>("SELECT * FROM orders WHERE location_id=? AND idempotency_key=?", [locationId, idempotencyKey]);
  }

  getByTrackingToken(trackingToken: string) {
    return this.db.get<any>("SELECT * FROM orders WHERE customer_tracking_token=?", [trackingToken]);
  }

  list(locationId: string) {
    return this.db.all<any>("SELECT * FROM orders WHERE location_id=? ORDER BY created_at DESC LIMIT 200", [locationId]);
  }

  events(orderId: string, executor: DbExecutor = this.db) {
    return executor.all<any>("SELECT * FROM order_events WHERE order_id=? ORDER BY created_at ASC", [orderId]);
  }

  async view(order: any, executor: DbExecutor = this.db) {
    const tableName = order.table_name_snapshot || (order.table_id
      ? (await executor.get<any>("SELECT name FROM restaurant_tables WHERE id=?", [order.table_id]))?.name || null
      : null);
    return {
      ...order,
      amount_paise: Number(order.amount_paise),
      tax_paise: Number(order.tax_paise || 0),
      discount_paise: Number(order.discount_paise || 0),
      packaging_fee_paise: Number(order.packaging_fee_paise || 0),
      service_fee_paise: Number(order.service_fee_paise || 0),
      delivery_fee_paise: Number(order.delivery_fee_paise || 0),
      lines: typeof order.lines === "string" ? JSON.parse(order.lines) : order.lines,
      publicOrderNumber: order.public_order_number || `QR-${order.id.slice(0, 8).toUpperCase()}`,
      trackingToken: order.customer_tracking_token || order.access_token,
      tableName,
      access_token: undefined,
      idempotency_key: undefined,
      request_hash: undefined,
    };
  }

  async create(input: {
    location: any;
    tenantAccount: any;
    profile: any;
    body: any;
    fingerprint: string;
  }) {
    const { location, tenantAccount, profile, body, fingerprint } = input;
    try {
      return await this.db.transaction(async (tx) => {
        const existing = await this.getByIdempotency(location.id, body.idempotencyKey, tx);
        if (existing) {
          if (existing.request_hash !== fingerprint) {
            throw Object.assign(new Error("Retry key already used with different order details"), { statusCode: 409 });
          }
          return { order: existing, accessToken: existing.access_token };
        }
        if (!profile.orderEnabled || !profile.orderTypes.includes(body.orderType)) {
          throw Object.assign(new Error("Orders are unavailable"), { statusCode: 409 });
        }
        if (body.paymentMethod === "counter" && !profile.payAtCounter) {
          throw Object.assign(new Error("Pay at counter is unavailable"), { statusCode: 400 });
        }
        if (body.paymentMethod === "upi" && !location.active_route_id) {
          throw Object.assign(new Error("UPI is unavailable"), { statusCode: 409 });
        }
        if (!tenantAccount.entitlements.orders) {
          throw Object.assign(new Error("Orders are unavailable"), { statusCode: 409 });
        }
        if (new Set(body.lines.map((line: any) => line.itemId)).size !== body.lines.length) {
          throw Object.assign(new Error("Combine duplicate items"), { statusCode: 400 });
        }
        if (profile.manualClosed) {
          throw Object.assign(new Error("Currently closed. Please try again during operating hours."), { statusCode: 409 });
        }
        if (body.orderType === "delivery" && !body.deliveryAddress.trim()) {
          throw Object.assign(new Error("Delivery address is required"), { statusCode: 400 });
        }

        const table = body.tableToken
          ? await tx.get<any>("SELECT * FROM restaurant_tables WHERE public_token=? AND location_id=? AND enabled=TRUE", [body.tableToken, location.id])
          : body.tableId
            ? await tx.get<any>("SELECT * FROM restaurant_tables WHERE id=? AND location_id=? AND enabled=TRUE", [body.tableId, location.id])
            : null;
        if ((body.orderType === "dine_in" || body.tableToken) && !table) {
          throw Object.assign(new Error("Table is unavailable"), { statusCode: 400 });
        }

        const lines = [];
        for (const lineInput of body.lines) {
          const item = await tx.get<any>("SELECT * FROM items WHERE id=? AND location_id=? AND archived=FALSE", [lineInput.itemId, location.id]);
          if (!item || !item.available || item.stock_status !== "AVAILABLE") {
            throw Object.assign(new Error("An item is unavailable. Refresh the menu."), { statusCode: 409 });
          }
          const variant = lineInput.variantId
            ? await tx.get<any>("SELECT * FROM menu_item_variants WHERE id=? AND item_id=? AND available=TRUE", [lineInput.variantId, item.id])
            : undefined;
          if (lineInput.variantId && !variant) {
            throw Object.assign(new Error(`${item.name} variant is unavailable`), { statusCode: 409 });
          }
          const modifiers = [];
          for (const modifierId of lineInput.modifierIds) {
            modifiers.push(await tx.get<any>(
              "SELECT m.*,g.id group_id,g.min_selection,g.max_selection,g.required FROM modifiers m JOIN modifier_groups g ON g.id=m.group_id JOIN menu_item_modifier_groups mig ON mig.group_id=g.id WHERE m.id=? AND m.available=TRUE AND mig.item_id=?",
              [modifierId, item.id],
            ));
          }
          if (modifiers.some((modifier: any) => !modifier)) {
            throw Object.assign(new Error(`${item.name} has an unavailable modifier`), { statusCode: 409 });
          }
          const groups = await tx.all<any>("SELECT g.* FROM modifier_groups g JOIN menu_item_modifier_groups mig ON mig.group_id=g.id WHERE mig.item_id=? AND g.enabled=TRUE", [item.id]);
          for (const group of groups) {
            const selected = modifiers.filter((modifier: any) => modifier.group_id === group.id).length;
            if (selected < group.min_selection || selected > group.max_selection || (group.required && selected < 1)) {
              throw Object.assign(new Error(`Choose valid options for ${group.name}`), { statusCode: 400 });
            }
          }
          const basePrice = variant
            ? Number(variant.price_paise)
            : item.discounted_price_paise != null && Number(item.discounted_price_paise) < Number(item.price_paise)
              ? Number(item.discounted_price_paise)
              : Number(item.price_paise);
          const modifierTotal = modifiers.reduce((sum: number, modifier: any) => sum + Number(modifier.price_paise), 0);
          const unit = basePrice + modifierTotal;
          lines.push({
            itemId: item.id,
            name: item.name,
            quantity: lineInput.quantity,
            pricePaise: unit,
            variantId: variant?.id,
            variantName: variant?.name,
            variantPricePaise: variant ? Number(variant.price_paise) : undefined,
            modifiers: modifiers.map((modifier: any) => ({ id: modifier.id, name: modifier.name, pricePaise: Number(modifier.price_paise) })),
            customerNote: lineInput.customerNote,
          });
        }

        const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.pricePaise, 0);
        const packaging = profile.packagingFeePaise || 0;
        const service = profile.serviceFeePaise || 0;
        const delivery = body.orderType === "delivery" ? (profile.deliveryFeePaise || 0) : 0;
        const taxBps = profile.taxBps || 0;
        const tax = Math.round((subtotal * taxBps) / 10000);
        const amount = subtotal + tax + packaging + service + delivery;
        if (subtotal < (profile.minimumOrderPaise || 0)) {
          throw Object.assign(new Error(`Minimum order is ₹${((profile.minimumOrderPaise || 0) / 100).toFixed(2)}`), { statusCode: 400 });
        }
        if (amount > 10000000) {
          throw Object.assign(new Error("Order exceeds maximum"), { statusCode: 400 });
        }

        await tx.run("INSERT INTO order_sequences(location_id) VALUES (?) ON CONFLICT(location_id) DO NOTHING", [location.id]);
        await tx.run("UPDATE order_sequences SET next_number=next_number+1 WHERE location_id=?", [location.id]);
        const sequence = await tx.get<any>("SELECT next_number-1 n FROM order_sequences WHERE location_id=?", [location.id]);
        const orderId = id();
        const accessToken = token();
        const publicOrderNumber = `QR-${sequence.n}`;
        await tx.run(
          `INSERT INTO orders(id,location_id,idempotency_key,request_hash,access_token,state,amount_paise,lines,instructions,order_type,payment_method,public_order_number,customer_tracking_token,table_id,table_name_snapshot,customer_name,customer_phone,delivery_address,landmark,tax_paise,packaging_fee_paise,service_fee_paise,delivery_fee_paise)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [orderId, location.id, body.idempotencyKey, fingerprint, accessToken, "submitted", amount, JSON.stringify(lines), body.instructions || "", body.orderType, body.paymentMethod, publicOrderNumber, accessToken, table?.id || null, table?.name || "", body.customerName || "", body.customerPhone || "", body.deliveryAddress || "", body.landmark || "", tax, packaging, service, delivery],
        );
        for (const line of lines) {
          const orderItemId = id();
          await tx.run("INSERT INTO order_items(id,order_id,menu_item_id,item_name_snapshot,variant_snapshot,variant_price_snapshot,unit_price_snapshot,quantity,line_total,customer_note) VALUES (?,?,?,?,?,?,?,?,?,?)", [orderItemId, orderId, line.itemId, line.name, line.variantName || null, line.variantPricePaise ?? null, line.pricePaise, line.quantity, line.pricePaise * line.quantity, line.customerNote || ""]);
          for (const modifier of line.modifiers) {
            await tx.run("INSERT INTO order_item_modifiers(id,order_item_id,modifier_name_snapshot,price_snapshot) VALUES (?,?,?,?)", [id(), orderItemId, modifier.name, modifier.pricePaise]);
          }
        }
        await tx.run("INSERT INTO order_events(id,order_id,state) VALUES (?,?,?)", [id(), orderId, "submitted"]);
        await tx.run("INSERT INTO events(location_id,day,kind,count) VALUES (?,CURRENT_DATE,?,1) ON CONFLICT(location_id,day,kind) DO UPDATE SET count=events.count+1", [location.id, "order_submitted"]);
        const assignedStaff = table
          ? await tx.get<any>(
            "SELECT a.user_id FROM table_staff_assignments a JOIN memberships m ON m.user_id=a.user_id AND m.tenant_id=a.tenant_id WHERE a.table_id=? AND a.tenant_id=? AND m.role!='owner' ORDER BY a.created_at ASC LIMIT 1",
            [table.id, location.tenant_id],
          )
          : undefined;
        const recipient = assignedStaff?.user_id
          ? assignedStaff.user_id
          : (await tx.get<any>("SELECT user_id FROM memberships WHERE tenant_id=? AND role='owner' ORDER BY user_id LIMIT 1", [location.tenant_id]))?.user_id;
        await tx.run("INSERT INTO outbox(id,location_id,recipient_user_id,title,body) VALUES (?,?,?,?,?)", [id(), location.id, recipient || null, "New order", `Order ${publicOrderNumber} is awaiting a decision.`]);
        const order = await this.getById(orderId, location.id, tx);
        return { order, accessToken };
      });
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
      const existing = await this.getByIdempotency(location.id, body.idempotencyKey);
      if (!existing) throw error;
      if (existing.request_hash !== fingerprint) {
        throw Object.assign(new Error("Retry key already used with different order details"), { statusCode: 409 });
      }
      return { order: existing, accessToken: existing.access_token };
    }
  }

  async transition(tx: DbTransaction, orderId: string, locationId: string, nextState: string, expectedState: string, actorId: string, reason: string) {
    const order = await this.getById(orderId, locationId, tx);
    if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
    if (order.state !== expectedState || !transitions[order.state]?.includes(nextState)) {
      throw Object.assign(new Error("Order changed or transition is invalid"), { statusCode: 409 });
    }
    if (nextState === "rejected" && !reason.trim()) {
      throw Object.assign(new Error("Rejection reason is required"), { statusCode: 400 });
    }
    await tx.run(
      `UPDATE orders SET state=?,updated_at=CURRENT_TIMESTAMP,
        accepted_at=CASE WHEN ?='accepted' THEN CURRENT_TIMESTAMP ELSE accepted_at END,
        preparing_at=CASE WHEN ?='preparing' THEN CURRENT_TIMESTAMP ELSE preparing_at END,
        ready_at=CASE WHEN ?='ready' THEN CURRENT_TIMESTAMP ELSE ready_at END,
        completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
        rejected_at=CASE WHEN ?='rejected' THEN CURRENT_TIMESTAMP ELSE rejected_at END
        WHERE id=? AND location_id=?`,
      [nextState, nextState, nextState, nextState, nextState, nextState, orderId, locationId],
    );
    await tx.run("INSERT INTO order_events(id,order_id,state,actor_id,reason) VALUES (?,?,?,?,?)", [id(), orderId, nextState, actorId, reason || null]);
    return order;
  }
}
