import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";

const db = openDb(":memory:");
const app = await createApp(db, envSchema.parse({ NODE_ENV: "test" }));
let token = "", lid = "", slug = "restaurant-test", item = "", variant = "", modifier = "";
const call = async (method: string, path: string, body?: unknown) => {
  const response = await app.inject({ method, url: `/api${path}`, headers: { authorization: `Bearer ${token}`, "x-client": "native" }, payload: body });
  return { status: response.statusCode, body: response.headers["content-type"]?.includes("json") ? response.json() : response.body };
};

before(async () => {
  token = (await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email: "restaurant@example.test", password: "restaurant secure password", name: "Demo Kitchen" } })).json().token;
  const me = await call("GET", "/me");
  const created = await call("POST", "/locations", { tenantId: me.body.tenants[0].id, name: "Demo Kitchen", slug, category: "restaurant" });
  lid = created.body.id;
  const profile = await call("GET", `/locations/${lid}`);
  await call("PUT", `/locations/${lid}`, { ...profile.body, published: true, profile: { ...profile.body.profile, orderEnabled: true, orderTypes: ["dine_in", "takeaway", "delivery"], taxBps: 500, packagingFeePaise: 20 } });
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
  assert.equal(order.body.publicOrderNumber, "QR-1000");
  assert.equal(order.body.amount_paise, 41915);
  assert.equal((await call("GET", `/public/orders/${order.body.trackingToken}`)).body.publicOrderNumber, "QR-1000");
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
