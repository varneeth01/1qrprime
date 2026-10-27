import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";

const db = openDb(":memory:");
const app = await createApp(db, envSchema.parse({ NODE_ENV: "test" }));
let token = "", tenantId = "", lid = "", slug = "restaurant-test", item = "", variant = "", modifier = "";
const call = async (method: string, path: string, body?: unknown) => {
  const response = await app.inject({ method, url: `/api${path}`, headers: { authorization: `Bearer ${token}`, "x-client": "native" }, payload: body });
  return { status: response.statusCode, body: response.headers["content-type"]?.includes("json") ? response.json() : response.body };
};

before(async () => {
  token = (await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email: "restaurant@example.test", password: "restaurant secure password", name: "Demo Kitchen" } })).json().token;
  const me = await call("GET", "/me");
  const created = await call("POST", "/locations", { tenantId: me.body.tenants[0].id, name: "Demo Kitchen", slug, category: "restaurant" });
  tenantId = me.body.tenants[0].id;
  lid = created.body.id;
  const profile = await call("GET", `/locations/${lid}`);
  await call("PUT", `/locations/${lid}`, { ...profile.body, published: true, profile: { ...profile.body.profile, orderEnabled: true, orderTypes: ["dine_in", "takeaway", "delivery"], taxBps: 500, packagingFeePaise: 20 } });
});

test("challenge reward redemption is atomic and snapshots the discount", async () => {
  const customerId = randomUUID();
  db.prepare("INSERT INTO customers(id,tenant_id,phone_e164,display_phone) VALUES (?,?,?,?)").run(customerId, tenantId, "+919999999999", "+919999999999");
  const customer = { id: customerId };
  const owner = db.prepare("SELECT id FROM users WHERE email=?").get("restaurant@example.test") as any;
  const rewardItemId = randomUUID();
  db.prepare("INSERT INTO items(id,location_id,name,description,section,price_paise,available) VALUES (?,?,?,?,?,?,?)").run(rewardItemId, lid, "Reward test item", "", "Test", 20000, 1);
  const challengeId = randomUUID();
  db.prepare("INSERT INTO challenges(id,tenant_id,location_id,name,customer_title,description,rule_type,target,reward_type,reward_value,start_at,end_at,show_in_menu,featured,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(challengeId, tenantId, lid, "Test reward", "Reward", "", "ORDER_COUNT", 1, "flat_discount", 10000, new Date(Date.now() - 60000).toISOString(), new Date(Date.now() + 3600000).toISOString(), 0, 0, "active", owner.id);
  const entitlementId = randomUUID();
  db.prepare("INSERT INTO challenge_reward_entitlements(id,tenant_id,challenge_id,customer_id,reward_type,reward_value,status,expires_at) VALUES (?,?,?,?,?,?,?,?)").run(entitlementId, tenantId, challengeId, customer.id, "flat_discount", 10000, "available", new Date(Date.now() + 3600000).toISOString());
  const payload = { idempotencyKey: randomUUID(), lines: [{ itemId: rewardItemId, quantity: 1 }], orderType: "takeaway", paymentMethod: "counter", customerPhone: "+919999999999", rewardEntitlementId: entitlementId };
  const [first, second] = await Promise.all([
    app.inject({ method: "POST", url: `/api/public/${slug}/orders`, payload }),
    app.inject({ method: "POST", url: `/api/public/${slug}/orders`, payload: { ...payload, idempotencyKey: randomUUID() } }),
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
  const winner = first.statusCode === 200 ? first.json() : second.json();
  assert.equal(winner.discount_paise, 10000);
  assert.equal((db.prepare("SELECT status,redeemed_order_id FROM challenge_reward_entitlements WHERE id=?").get(entitlementId) as any).status, "redeemed");
});

after(async () => { await app.close(); db.close(); });

test("restaurant menu supports categories, variants and modifiers with authoritative totals", async () => {
  const category = await call("POST", `/locations/${lid}/menu/categories`, { name: "Main Course", displayOrder: 1 });
  assert.equal(category.status, 200);
  const created = await call("POST", `/locations/${lid}/items`, { name: "Paneer Pizza", section: "Main Course", categoryId: category.body.id, price_paise: 29900, foodType: "VEG", tags: ["bestseller"], available: true });
  assert.equal(created.status, 200); item = created.body.id;
  const v = await call("POST", `/locations/${lid}/menu/items/${item}/variants`, { name: "Medium", pricePaise: 34900 });
  variant = v.body.id;
  const g = await call("POST", `/locations/${lid}/menu/modifier-groups`, { itemId: item, name: "Extras", minSelection: 1, maxSelection: 2, required: true });
  const m = await call("POST", `/locations/${lid}/menu/modifier-groups/${g.body.id}/modifiers`, { name: "Extra cheese", pricePaise: 5000 });
  modifier = m.body.id;
  const publicMenu = await call("GET", `/public/${slug}`);
  assert.equal(publicMenu.body.categories[0].name, "Main Course");
  assert.equal(publicMenu.body.items[0].variants[0].name, "Medium");
  assert.equal(publicMenu.body.items[0].modifierGroups[0].modifiers[0].name, "Extra cheese");
  const invalid = await call("POST", `/public/${slug}/orders`, { idempotencyKey: randomUUID(), lines: [{ itemId: item, quantity: 1, variantId: variant }], orderType: "takeaway", paymentMethod: "counter" });
  assert.equal(invalid.status, 400);
  const order = await call("POST", `/public/${slug}/orders`, { idempotencyKey: randomUUID(), lines: [{ itemId: item, quantity: 1, variantId: variant, modifierIds: [modifier] }], orderType: "takeaway", paymentMethod: "counter", customerName: "Asha", customerPhone: "+919999999999" });
  assert.equal(order.status, 200);
  assert.match(order.body.publicOrderNumber, /^QR-\d+$/);
  assert.equal(order.body.amount_paise, 41915);
  assert.equal(order.body.customer_phone, undefined);
  const tracked = await call("GET", `/public/orders/${order.body.trackingToken}`);
  assert.equal(tracked.body.publicOrderNumber, order.body.publicOrderNumber);
  assert.equal(tracked.body.customer_phone, undefined);
});

test("customer can keep ordering while an earlier order remains independently editable", async () => {
  const first = await call("POST", `/public/${slug}/orders`, {
    idempotencyKey: randomUUID(),
    lines: [{ itemId: item, quantity: 2, variantId: variant, modifierIds: [modifier] }],
    orderType: "takeaway",
    paymentMethod: "counter",
  });
  assert.equal(first.status, 200);
  const second = await call("POST", `/public/${slug}/orders`, {
    idempotencyKey: randomUUID(),
    lines: [{ itemId: item, quantity: 1, variantId: variant, modifierIds: [modifier] }],
    orderType: "takeaway",
    paymentMethod: "counter",
  });
  assert.equal(second.status, 200);
  assert.notEqual(second.body.id, first.body.id);

  const orderItem = first.body.orderItems[0];
  const cancelled = await app.inject({
    method: "POST",
    url: `/api/orders/${first.body.id}/items/${orderItem.order_item_id}/cancel`,
    headers: { "x-order-token": first.body.accessToken },
    payload: { quantity: 1, idempotencyKey: randomUUID() },
  });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().order.orderItems[0].cancelled_quantity, 1);
  assert.equal(cancelled.json().order.orderItems[0].quantity, 2);

  const secondTracked = await app.inject({
    method: "GET",
    url: `/api/orders/${second.body.id}`,
    headers: { "x-order-token": second.body.accessToken },
  });
  assert.equal(secondTracked.statusCode, 200);
  assert.equal(secondTracked.json().state, "submitted");

  db.prepare("UPDATE order_items SET cancellable_until=? WHERE id=?").run(
    new Date(Date.now() - 60_000).toISOString(),
    orderItem.order_item_id,
  );
  const locked = await app.inject({
    method: "POST",
    url: `/api/orders/${first.body.id}/items/${orderItem.order_item_id}/cancel`,
    headers: { "x-order-token": first.body.accessToken },
    payload: { quantity: 1, idempotencyKey: randomUUID() },
  });
  assert.equal(locked.statusCode, 409);
  assert.equal(locked.json().code, "ITEM_CANCELLATION_LOCKED");
});

test("restaurant order transitions require an explicit rejection reason", async () => {
  const order = await call("POST", `/public/${slug}/orders`, { idempotencyKey: randomUUID(), lines: [{ itemId: item, quantity: 1, variantId: variant, modifierIds: [modifier] }], orderType: "takeaway", paymentMethod: "counter" });
  assert.equal((await call("POST", `/locations/${lid}/orders/${order.body.id}/state`, { state: "rejected", expectedState: "submitted" })).status, 400);
  assert.equal((await call("POST", `/locations/${lid}/orders/${order.body.id}/state`, { state: "accepted", expectedState: "submitted" })).status, 200);
  assert.equal((await call("POST", `/locations/${lid}/orders/${order.body.id}/state`, { state: "preparing", expectedState: "accepted" })).status, 200);
});

test("table QR context is stable and order history keeps a table snapshot", async () => {
  const created = await call("POST", `/locations/${lid}/tables`, { name: "Table 7" });
  assert.equal(created.status, 200);
  assert.match(created.body.url, /[?&]t=/);
  const publicPage = await call("GET", `/public/${slug}?t=${encodeURIComponent(created.body.publicToken)}`);
  assert.equal(publicPage.body.table.name, "Table 7");
  const order = await call("POST", `/public/${slug}/orders`, {
    idempotencyKey: randomUUID(),
    lines: [{ itemId: item, quantity: 1, variantId: variant, modifierIds: [modifier] }],
    orderType: "dine_in",
    paymentMethod: "counter",
    tableToken: created.body.publicToken,
  });
  assert.equal(order.status, 200);
  assert.equal(order.body.tableName, "Table 7");
  await call("PATCH", `/locations/${lid}/tables/${created.body.id}`, { name: "Window Table", enabled: true });
  const historical = await call("GET", `/locations/${lid}/orders`);
  const saved = historical.body.orders.find((x: any) => x.id === order.body.id);
  assert.equal(saved.tableName, "Table 7");
  const qr = await call("GET", `/locations/${lid}/qr?format=svg&kind=table&tableId=${created.body.id}`);
  assert.equal(qr.status, 200);
  assert.match(qr.body, /<svg/);
});

test("paid item cancellation is refund-idempotent and order detail preserves financial history", async () => {
  const created = await call("POST", `/public/${slug}/orders`, {
    idempotencyKey: randomUUID(),
    lines: [{ itemId: item, quantity: 1, variantId: variant, modifierIds: [modifier] }],
    orderType: "takeaway",
    paymentMethod: "counter",
  });
  assert.equal(created.status, 200);
  db.prepare("UPDATE orders SET payment_state='paid',paid_at=CURRENT_TIMESTAMP WHERE id=?").run(created.body.id);
  const orderItem = db.prepare("SELECT id FROM order_items WHERE order_id=?").get(created.body.id) as any;
  const idempotencyKey = randomUUID();
  const payload = { quantity: 1, idempotencyKey, reason: "Customer escalation", note: "Refund test", override: true };
  const first = await call("POST", `/locations/${lid}/orders/${created.body.id}/items/${orderItem.id}/cancel`, payload);
  const retry = await call("POST", `/locations/${lid}/orders/${created.body.id}/items/${orderItem.id}/cancel`, payload);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal((db.prepare("SELECT count(*) c FROM refunds WHERE order_id=?").get(created.body.id) as any).c, 1);
  const detail = await call("GET", `/locations/${lid}/orders/${created.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.refunds.length, 1);
  assert.equal(detail.body.refunds[0].status, "MANUAL_REQUIRED");
  const completed = await call("POST", `/locations/${lid}/orders/${created.body.id}/refunds/${detail.body.refunds[0].id}/complete-manual`, { note: "Refund completed during test" });
  assert.equal(completed.status, 200);
  assert.equal((db.prepare("SELECT status FROM refunds WHERE order_id=?").get(created.body.id) as any).status, "SUCCEEDED");
});
