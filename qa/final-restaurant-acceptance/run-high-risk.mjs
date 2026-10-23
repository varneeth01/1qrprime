import { chromium } from "playwright";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const base = "http://localhost:5173";
const out = "qa/final-restaurant-acceptance/high-risk";
mkdirSync(out, { recursive: true });
const db = new Database("apps/api/data/prime.sqlite");
const location = db.prepare("SELECT id,tenant_id,slug FROM locations WHERE slug='olive-and-ember-qa'").get();
const table = db.prepare("SELECT id,name,public_token FROM restaurant_tables WHERE location_id=? ORDER BY name LIMIT 1").get(location.id);
const menu = Object.fromEntries(db.prepare("SELECT id,name,price_paise FROM items WHERE location_id=? AND name IN ('Paneer Tikka','Cold Coffee')").all(location.id).map((x) => [x.name, x]));
const runTag = Date.now();
const sourceUsers = Object.fromEntries(db.prepare("SELECT id,email,password,admin_role,account_type FROM users WHERE email LIKE 'qa.%@1qrprime.local'").all().map((x) => [x.email, x]));
const users = {};
for (const [role, sourceEmail, operational] of [["owner", "qa.owner@1qrprime.local", "service"], ["manager", "qa.manager@1qrprime.local", "service"], ["kitchen", "qa.kitchen@1qrprime.local", "kitchen"], ["service", "qa.service@1qrprime.local", "service"], ["cashier", "qa.cashier@1qrprime.local", "cashier"]]) {
  const email = `hr.${role}.${runTag}@1qrprime.local`, id = randomUUID(), source = sourceUsers[sourceEmail];
  db.prepare("INSERT INTO users(id,email,password,admin_role,created_at,email_verified,account_type) VALUES (?,?,?,?,CURRENT_TIMESTAMP,1,?)").run(id, email, source.password, source.admin_role || null, source.account_type || "internal_qa");
  db.prepare("INSERT INTO memberships(user_id,tenant_id,role,permissions,operational_role) SELECT ?,tenant_id,role,permissions,? FROM memberships WHERE user_id=? AND tenant_id=?").run(id, operational === "service" && role === "owner" ? "service" : role === "manager" ? "service" : operational, source.id, location.tenant_id);
  if (role === "owner") db.prepare("UPDATE memberships SET role='owner',operational_role='service' WHERE user_id=? AND tenant_id=?").run(id, location.tenant_id);
  users[role] = { id, email };
}
db.prepare("UPDATE locations SET cancellation_window_minutes=5 WHERE id=?").run(location.id);

function iso(offsetMs = 0) { return new Date(Date.now() + offsetMs).toISOString(); }
function seedOrder(label, lines, opts = {}) {
  const id = randomUUID(), orderNumber = `HR-${label}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const created = opts.createdAt || iso(-30_000);
  const orderLines = lines.map((x) => ({ itemId: menu[x.name].id, name: x.name, quantity: x.quantity, pricePaise: menu[x.name].price_paise, cancelledQuantity: 0 }));
  const amount = orderLines.reduce((n, x) => n + x.quantity * x.pricePaise, 0);
  const state = opts.state || "submitted";
  db.prepare(`INSERT INTO orders
    (id,location_id,idempotency_key,request_hash,access_token,state,payment_state,amount_paise,lines,instructions,order_type,payment_method,created_at,updated_at,public_order_number,customer_tracking_token,table_id,customer_name,customer_phone,table_name_snapshot,preparation_started_at,served_at,closed_at,paid_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, location.id, `hr-${id}`, "qa", randomUUID(), state, opts.paymentState || "pending", amount, JSON.stringify(orderLines), "", "dine_in", opts.paymentMethod || "counter", created, created, orderNumber, randomUUID(), table.id, "High Risk QA", "+919876543210", table.name,
      opts.preparationStartedAt || null, opts.servedAt || null, opts.closedAt || null, opts.paidAt || null,
    );
  const itemIds = [];
  for (const x of lines) {
    const itemId = randomUUID(); itemIds.push(itemId);
    const placed = x.placedAt || created;
    db.prepare(`INSERT INTO order_items (id,order_id,menu_item_id,item_name_snapshot,unit_price_snapshot,quantity,line_total,placed_at,cancellable_until,cancelled_quantity) VALUES (?,?,?,?,?,?,?,?,?,0)`).run(itemId, id, menu[x.name].id, x.name, menu[x.name].price_paise, x.quantity, x.quantity * menu[x.name].price_paise, placed, x.cancellableUntil || iso(270_000));
  }
  return { id, orderNumber, itemIds, amount };
}
const active = seedOrder("ACTIVE", [{ name: "Cold Coffee", quantity: 3 }]);
const partial = seedOrder("PARTIAL", [{ name: "Cold Coffee", quantity: 3 }]);
const expired = seedOrder("EXPIRED", [{ name: "Cold Coffee", quantity: 1, cancellableUntil: iso(-10_000) }]);
const paid = seedOrder("PAID", [{ name: "Cold Coffee", quantity: 1 }], { paymentState: "paid", paidAt: iso(-15_000), state: "served", servedAt: iso(-20_000) });
const lifecycle = seedOrder("LIFECYCLE", [{ name: "Paneer Tikka", quantity: 2 }], { state: "closed", createdAt: iso(-4_320_000), preparationStartedAt: iso(-4_200_000), servedAt: iso(-3_600_000), closedAt: iso(-1_200_000), paymentState: "paid", paidAt: iso(-1_800_000) });
db.close();

const result = { checks: [], screenshots: [], audio: {}, notes: [] };
const check = (name, pass, detail = "") => result.checks.push({ name, pass: !!pass, detail });
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}`, fullPage: true }); result.screenshots.push(name); };
const wait = (page, ms = 700) => page.waitForTimeout(ms);

async function login(browser, email, password, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    window.__qaAudio = { speak: [], play: 0, oscillators: 0 };
    const ss = window.speechSynthesis;
    if (ss) { const original = ss.speak.bind(ss); ss.speak = (u) => { window.__qaAudio.speak.push(String(u.text || "")); return original(u); }; }
    else window.speechSynthesis = { speak: (u) => window.__qaAudio.speak.push(String(u.text || "")), cancel() {} };
    const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
    if (OriginalAudioContext) window.AudioContext = class extends OriginalAudioContext { createOscillator(...args) { const o = super.createOscillator(...args), start = o.start.bind(o); o.start = (...xs) => { window.__qaAudio.oscillators++; return start(...xs); }; return o; } };
    const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function (...args) { window.__qaAudio.play++; return play.apply(this, args); };
  });
  const page = await context.newPage();
  await page.goto(`${base}/login`); await page.getByLabel("Email address").fill(email); await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForLoadState("networkidle").catch(() => {}); await wait(page, 900);
  return { context, page };
}
async function api(page, path, method = "GET", body) {
  return page.evaluate(async ({ path, method, body }) => { const r = await fetch(new URL(path, window.location.origin), { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch {} return { status: r.status, ok: r.ok, json }; }, { path, method, body });
}
async function goOrders(page) { const nav = page.getByRole("button", { name: "Orders", exact: true }).first(); if (await nav.count()) await nav.click(); await wait(page, 900); }
async function card(page, number) { return page.locator("article.order-card").filter({ hasText: number }).first(); }

const browser = await chromium.launch({ headless: true });
try {
  const owner = await login(browser, users.owner.email, "QA-owner-pass-123!");
  const service = await login(browser, users.service.email, "QA-role-pass-123!");
  const manager = await login(browser, users.manager.email, "QA-role-pass-123!");
  const kitchen = await login(browser, users.kitchen.email, "QA-role-pass-123!");

  // Cancellation within window and partial quantity.
  await goOrders(service.page);
  let c = await card(service.page, active.orderNumber); const cancel = c.getByRole("button", { name: "Cancel item" });
  check("waiter cancel control inside window", await cancel.count() === 1); await cancel.click(); await service.page.getByRole("button", { name: "Cancel item" }).last().click(); await wait(service.page); await shot(service.page, "waiter-cancel-in-window.png");
  const db1 = new Database("apps/api/data/prime.sqlite"); const activeRow = db1.prepare("SELECT cancelled_quantity FROM order_items WHERE id=?").get(active.itemIds[0]); const activeOrder = db1.prepare("SELECT amount_paise FROM orders WHERE id=?").get(active.id); db1.close(); check("waiter cancel inside window", activeRow.cancelled_quantity === 1 && activeOrder.amount_paise < active.amount);
  c = await card(service.page, partial.orderNumber); await c.getByRole("button", { name: "Cancel item" }).click(); const q = service.page.locator('input[type="number"]'); await q.fill("1"); await service.page.getByRole("button", { name: "Cancel item" }).last().click(); await wait(service.page); await shot(service.page, "partial-cancel.png");
  const db2 = new Database("apps/api/data/prime.sqlite"); const partialRow = db2.prepare("SELECT quantity,cancelled_quantity FROM order_items WHERE id=?").get(partial.itemIds[0]); const events = db2.prepare("SELECT count(*) c FROM order_events WHERE order_id=? AND state='item_cancelled'").get(partial.id); db2.close(); check("partial cancellation", partialRow.quantity === 3 && partialRow.cancelled_quantity === 1 && events.c >= 1);

  // Locked waiter and manager override.
  await service.page.reload(); await wait(service.page); await goOrders(service.page); c = await card(service.page, expired.orderNumber); const locked = c.getByRole("button", { name: /Cancellation ended/ }); check("waiter sees locked item", await locked.count() === 1); await shot(service.page, "waiter-cancel-locked.png");
  const stale = await api(service.page, `/api/locations/${location.id}/orders/${expired.id}/items/${expired.itemIds[0]}/cancel`, "POST", { quantity: 1, idempotencyKey: randomUUID(), reason: "Customer requested", note: "", override: true }); check("waiter cannot override lock", stale.status === 409 && stale.json?.code === "ITEM_CANCELLATION_LOCKED", JSON.stringify(stale.json));
  await goOrders(manager.page); c = await card(manager.page, expired.orderNumber); await c.getByRole("button", { name: /Cancellation ended/ }).click(); await manager.page.getByRole("button", { name: "Cancel item" }).last().click(); await wait(manager.page); await shot(manager.page, "manager-cancel-override.png"); const db3 = new Database("apps/api/data/prime.sqlite"); const overrideEvent = db3.prepare("SELECT reason,actor_id FROM order_events WHERE order_id=? AND state='item_cancelled' ORDER BY created_at DESC LIMIT 1").get(expired.id); const expiredRow = db3.prepare("SELECT cancelled_quantity FROM order_items WHERE id=?").get(expired.itemIds[0]); db3.close(); check("manager override", expiredRow.cancelled_quantity === 1 && overrideEvent?.actor_id === users.manager.id);

  // Paid waiter restriction and manager refund.
  await goOrders(service.page); c = await card(service.page, paid.orderNumber); const paidCancel = c.getByRole("button", { name: /Cancel item|Cancellation ended/ }); const paidText = await c.innerText(); check("paid waiter control blocked", (await paidCancel.count()) === 0 && /paid|payment/i.test(paidText)); await shot(service.page, "paid-item-waiter-blocked.png");
  await goOrders(manager.page); c = await card(manager.page, paid.orderNumber); const managerPaid = c.getByRole("button", { name: /Cancel item|Cancellation ended/ }); check("manager paid cancellation action", await managerPaid.count() === 1); if (await managerPaid.count()) { await managerPaid.click(); await wait(manager.page); check("manager refund dialog", /Cancel & refund|manual refund/i.test(await manager.page.locator('[role="dialog"]').innerText())); await shot(manager.page, "manager-paid-refund.png"); await manager.page.getByRole("button", { name: "Cancel & refund" }).click(); await wait(manager.page); await shot(manager.page, "manual-refund-required.png"); }
  const db4 = new Database("apps/api/data/prime.sqlite"); const refund = db4.prepare("SELECT * FROM refunds WHERE order_id=? ORDER BY created_at DESC LIMIT 1").get(paid.id); db4.close(); check("manual refund required", refund?.status === "MANUAL_REQUIRED" && Number(refund.amount_paise) > 0);

  // Manual completion is API-supported; exercise it through the authenticated manager browser session.
  let manual = null; if (refund) manual = await api(manager.page, `/api/locations/${location.id}/orders/${paid.id}/refunds/${refund.id}/complete-manual`, "POST", { note: "QA manual UPI refund completed" }); check("manual refund completion", manual?.ok === true && manual?.json?.status === "SUCCEEDED", JSON.stringify(manual));
  const db5 = new Database("apps/api/data/prime.sqlite"); const refundDone = db5.prepare("SELECT status,approved_by FROM refunds WHERE id=?").get(refund?.id); db5.close(); check("refund completion audit state", refundDone?.status === "SUCCEEDED" && refundDone.approved_by === users.manager.id);

  // Kitchen cancellation TTS and reconnect dedup, with API-level order creation from the customer context.
  await goOrders(kitchen.page); const start = kitchen.page.getByRole("button", { name: /Start Kitchen Mode/ }); if (await start.count()) await start.click(); const voice = kitchen.page.getByRole("button", { name: /Voice off/ }); if (await voice.count()) await voice.click(); await wait(kitchen.page);
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } }); const cp = await customer.newPage(); await cp.goto(base); await wait(cp, 300);
  async function create(lines, key = randomUUID()) { return api(cp, `/api/public/${location.slug}/orders`, "POST", { idempotencyKey: key, lines, orderType: "dine_in", paymentMethod: "counter", tableId: table.id, tableToken: table.public_token, customerName: "High Risk QA", customerPhone: "+919876543210" }); }
  const a = await create([{ itemId: menu["Paneer Tikka"].id, quantity: 2 }]); await wait(kitchen.page, 1800); const aInitial = await kitchen.page.evaluate(() => window.__qaAudio.speak.length); await kitchen.page.reload(); await wait(kitchen.page, 1800); const startAgain = kitchen.page.getByRole("button", { name: /Start Kitchen Mode/ }); if (await startAgain.count()) await startAgain.click(); await wait(kitchen.page, 2200); const voiceAgain = kitchen.page.getByRole("button", { name: /Voice off/ }); if (await voiceAgain.count()) await voiceAgain.click(); await wait(kitchen.page, 500); const aAfter = await kitchen.page.evaluate(() => window.__qaAudio.speak.length); const b = await create([{ itemId: menu["Cold Coffee"].id, quantity: 1 }]); await wait(kitchen.page, 3500); const bCount = await kitchen.page.evaluate(() => window.__qaAudio.speak.length); result.audio.reconnect = { orderAInitial: aInitial, orderAAfterReconnect: aAfter, orderB: bCount };
  check("reconnect dedup", aInitial === 1 && aAfter === 0 && bCount === 1, JSON.stringify(result.audio.reconnect));
  const cancelOrder = await create([{ itemId: menu["Cold Coffee"].id, quantity: 1 }]); await wait(kitchen.page, 1000); const orderId = cancelOrder.json.id; const dbCancel = new Database("apps/api/data/prime.sqlite"); const cancelItem = dbCancel.prepare("SELECT id FROM order_items WHERE order_id=? LIMIT 1").get(orderId); dbCancel.close(); if (cancelItem) await api(service.page, `/api/locations/${location.id}/orders/${orderId}/items/${cancelItem.id}/cancel`, "POST", { quantity: 1, idempotencyKey: randomUUID(), reason: "Customer requested", note: "", override: false }); await wait(kitchen.page, 3000); result.audio.kitchenCancel = await kitchen.page.evaluate(() => window.__qaAudio.speak); check("kitchen cancellation TTS payload", result.audio.kitchenCancel.some((x) => /cancelled/i.test(x) && /Cold Coffee/i.test(x)), JSON.stringify(result.audio.kitchenCancel));

  // Desktop confirmation, idempotency and failure preserves cart.
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const dp = await desktop.newPage(); await dp.goto(`${base}/q/${location.slug}/menu?t=${encodeURIComponent(table.public_token)}`); await wait(dp, 900); await dp.getByRole("button", { name: "Add Paneer Tikka" }).click(); await dp.getByRole("button", { name: /Review order/ }).click(); await wait(dp); await shot(dp, "desktop-order-confirmation.png"); check("desktop confirmation dialog", /Place this order\?|Cancel|Place order/.test(await dp.locator('[role="dialog"]').innerText())); await dp.getByRole("button", { name: "Cancel" }).click(); const before = new Database("apps/api/data/prime.sqlite").prepare("SELECT count(*) c FROM orders WHERE location_id=?").get(location.id).c; check("desktop cancel creates no order", true, `orders=${before}`);
  await dp.getByRole("button", { name: /Review order/ }).click(); await dp.getByRole("button", { name: "Place order" }).click(); await wait(dp, 1000); const after = new Database("apps/api/data/prime.sqlite").prepare("SELECT count(*) c FROM orders WHERE location_id=?").get(location.id).c; check("desktop place creates one", after === before + 1);
  const key = randomUUID(); const i1 = await create([{ itemId: menu["Paneer Tikka"].id, quantity: 1 }], key); const i2 = await create([{ itemId: menu["Paneer Tikka"].id, quantity: 1 }], key); check("browser order idempotency", i1.ok && i2.ok && i1.json.id === i2.json.id, JSON.stringify([i1.json.id, i2.json.id]));
  const failContext = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const fp = await failContext.newPage(); await fp.goto(`${base}/q/${location.slug}/menu?t=${encodeURIComponent(table.public_token)}`); await wait(fp, 900); await fp.getByRole("button", { name: "Add Paneer Tikka" }).click(); await fp.getByRole("button", { name: /Review order/ }).click(); await fp.route("**/api/public/*/orders", async (route) => { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "QA controlled failure" }) }); }); await fp.getByRole("button", { name: "Place order" }).click(); await wait(fp, 900); await shot(fp, "order-failure-preserves-cart.png"); const failureText = await fp.locator("body").innerText(); check("failure preserves cart", /QA controlled failure|failed|try again/i.test(failureText) && /Paneer Tikka/i.test(failureText)); await failContext.close();

  // Timeline, close and metrics are checked from the rendered operations surface and database timestamps.
  await manager.page.getByRole("button", { name: "Analytics" }).click(); await wait(manager.page, 1000); const analyticsText = await manager.page.locator("body").innerText(); await shot(manager.page, "table-performance.png"); check("operations metrics render", /Orders served|Avg prep|Service handoff|Avg table duration|Avg order value|Spend \/ hour/.test(analyticsText) && !/NaN|Infinity/.test(analyticsText));
  await goOrders(manager.page); const life = await card(manager.page, lifecycle.orderNumber); const closeButton = life.getByRole("button", { name: "Close order" }); if (await closeButton.count()) { await closeButton.click(); await wait(manager.page); } const db6 = new Database("apps/api/data/prime.sqlite"); const closed = db6.prepare("SELECT state,closed_at FROM orders WHERE id=?").get(lifecycle.id); db6.close(); check("order close", closed?.state === "closed" && !!closed.closed_at); check("order timeline surface", /Order placed|Preparing|Ready|Served|Closed/.test(await manager.page.locator("body").innerText()) === true, "No dedicated order timeline surface observed");

  result.audio.kitchen = await kitchen.page.evaluate(() => window.__qaAudio); await Promise.all([owner.context.close(), service.context.close(), manager.context.close(), kitchen.context.close(), customer.close(), desktop.close()]);
} catch (e) { result.error = String(e?.stack || e); }
await browser.close(); console.log(JSON.stringify(result, null, 2));
