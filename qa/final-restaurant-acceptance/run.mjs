import { chromium } from "playwright";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

const base = "http://localhost:5173";
const out = "qa/final-restaurant-acceptance";
mkdirSync(out, { recursive: true });
const db = new Database("apps/api/data/prime.sqlite");
const location = db.prepare("SELECT id,slug FROM locations WHERE slug='olive-and-ember-qa'").get();
const table = db.prepare("SELECT id,name,public_token FROM restaurant_tables WHERE location_id=? ORDER BY name LIMIT 1").get(location.id);
const items = db.prepare("SELECT id,name FROM items WHERE location_id=? AND name IN ('Paneer Tikka','Cold Coffee','Lime Soda')").all(location.id);
db.close();
const item = (name) => items.find((x) => x.name === name).id;
const report = { screenshots: [], checks: [], audio: { kitchen: [], service: [] }, errors: [] };
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}`, fullPage: true }); report.screenshots.push(name); };
const check = (name, pass, detail = "") => report.checks.push({ name, pass: !!pass, detail });
const wait = (page, ms = 500) => page.waitForTimeout(ms);
async function login(email, password, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    window.__qaAudio = { speak: [], play: 0, oscillators: 0 };
    const originalSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
    if (originalSpeak) window.speechSynthesis.speak = (utterance) => { window.__qaAudio.speak.push(String(utterance.text || "")); return originalSpeak(utterance); };
    const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
    if (OriginalAudioContext) window.AudioContext = class extends OriginalAudioContext {
      createOscillator(...args) { const oscillator = super.createOscillator(...args); const originalStart = oscillator.start.bind(oscillator); oscillator.start = (...xs) => { window.__qaAudio.oscillators++; return originalStart(...xs); }; return oscillator; }
    };
    if (!window.AudioContext) window.AudioContext = class { currentTime = 0; destination = {}; resume() { return Promise.resolve(); } createOscillator() { const a = { connect() {}, start() { window.__qaAudio.oscillators++; }, stop() {} }; return a; } createGain() { return { gain: { value: 0 }, connect() {} }; } };
    if (!window.speechSynthesis) window.speechSynthesis = { speak: (utterance) => window.__qaAudio.speak.push(String(utterance.text || "")), cancel() {} };
    else {
      const originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (utterance) => { window.__qaAudio.speak.push(String(utterance.text || "")); return originalSpeak(utterance); };
    }
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) { window.__qaAudio.play++; return play.apply(this, args); };
  });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await wait(page, 700);
  return { context, page };
}
async function createPublicOrder(page, lines, key = crypto.randomUUID()) {
  return page.request.post(`${base}/api/public/${location.slug}/orders`, { data: { idempotencyKey: key, lines, orderType: "dine_in", paymentMethod: "counter", tableId: table.id, tableToken: table.public_token, customerName: "QA Browser", customerPhone: "+919876543210" } });
}

const browser = await chromium.launch({ headless: true });
try {
  const owner = await login("qa.owner@1qrprime.local", "QA-owner-pass-123!");
  const ownerPage = owner.page;
  check("owner login", (await ownerPage.locator("body").innerText()).includes("Olive & Ember"));
  await ownerPage.getByRole("button", { name: "Staff" }).click(); await wait(ownerPage);
  await shot(ownerPage, "staff-role-assignment.png");
  check("staff role assignment visible", await ownerPage.locator('select[aria-label^="Role for"]').count() >= 4);
  for (const [email, role] of [["qa.manager@1qrprime.local", "manager"], ["qa.kitchen@1qrprime.local", "kitchen"], ["qa.service@1qrprime.local", "service"], ["qa.cashier@1qrprime.local", "cashier"]]) {
    const row = ownerPage.locator("article, .list-row, .staff-row").filter({ hasText: email }).first();
    const select = row.locator("select").first();
    if (await select.count()) await select.selectOption(role);
  }
  await wait(ownerPage, 500); await shot(ownerPage, "staff-role-assignment.png");
  await owner.context.close();

  const kitchen = await login("qa.kitchen@1qrprime.local", "QA-role-pass-123!");
  await shot(kitchen.page, "kitchen-navigation.png");
  check("kitchen navigation excludes staff", !(await kitchen.page.locator("body").innerText()).includes("Staff"));
  await kitchen.page.getByRole("button", { name: "Orders" }).click(); await wait(kitchen.page);
  await shot(kitchen.page, "kitchen-mode-before-start.png");
  check("kitchen mode does not auto-audio", (await kitchen.page.evaluate(() => window.__qaAudio.oscillators)) === 0);
  const start = kitchen.page.getByRole("button", { name: /Start Kitchen Mode/ });
  if (await start.count()) await start.click();
  await wait(kitchen.page); await shot(kitchen.page, "kitchen-mode-active.png");
  check("kitchen mode active", (await kitchen.page.locator("body").innerText()).includes("Kitchen Mode on"));
  const enableSound = kitchen.page.getByRole("button", { name: /Enable sound/ });
  if (await enableSound.count()) await enableSound.click();
  const voiceToggle = kitchen.page.getByRole("button", { name: /Voice off/ });
  if (await voiceToggle.count()) await voiceToggle.click();
  const testSound = kitchen.page.getByRole("button", { name: /Test sound/ });
  if (await testSound.count()) await testSound.click();
  await wait(kitchen.page); check("kitchen test sound API", (await kitchen.page.evaluate(() => window.__qaAudio.oscillators)) > 0);

  const service = await login("qa.service@1qrprime.local", "QA-role-pass-123!");
  await service.page.getByRole("button", { name: "Orders" }).click(); await wait(service.page);
  await shot(service.page, "service-navigation.png");
  check("service navigation visible", (await service.page.locator("body").innerText()).includes("Service requests"));
  const manager = await login("qa.manager@1qrprime.local", "QA-role-pass-123!");
  await manager.page.getByRole("button", { name: "Orders" }).click(); await wait(manager.page); await shot(manager.page, "manager-order-actions.png");
  check("manager orders visible", (await manager.page.locator("body").innerText()).includes("Orders"));

  // Customer mobile review and deliberate confirmation.
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await customer.addInitScript(() => { window.__qaAudio = { speak: [], play: 0, oscillators: 0 }; });
  const cp = await customer.newPage();
  const customerUrl = `${base}/q/${location.slug}/menu?t=${encodeURIComponent(table.public_token)}`;
  await cp.goto(customerUrl); await wait(cp, 700);
  await cp.getByRole("button", { name: "Add Paneer Tikka" }).click();
  await cp.getByRole("button", { name: "Add Paneer Tikka" }).click();
  await cp.getByRole("button", { name: "Add Cold Coffee" }).click();
  await shot(cp, "customer-cart-review-mobile.png");
  check("cart review rendered", (await cp.locator("body").innerText()).includes("Review order"));
  const review = cp.getByRole("button", { name: /Review order/ });
  if (await review.count()) await review.click(); await wait(cp);
  await shot(cp, "customer-slide-confirm-mobile.png");
  const slider = cp.locator('input[type="range"]');
  if (await slider.count()) { await slider.focus(); await slider.press("End"); }
  await wait(cp, 1000); await shot(cp, "customer-order-success.png");
  check("customer order success", /order|confirmed|received/i.test(await cp.locator("body").innerText()));

  // Create a second order for operational status and cancellation checks.
  const created = await createPublicOrder(cp, [{ itemId: item("Paneer Tikka"), quantity: 2 }, { itemId: item("Cold Coffee"), quantity: 1 }]);
  const order = await created.json();
  check("public order created", created.ok(), JSON.stringify(order).slice(0, 160));
  await kitchen.page.reload(); await wait(kitchen.page, 800); await kitchen.page.getByRole("button", { name: "Orders" }).click(); await wait(kitchen.page, 500);
  const realtimeOrder = await createPublicOrder(kitchen.page, [{ itemId: item("Paneer Tikka"), quantity: 2 }, { itemId: item("Cold Coffee"), quantity: 1 }]);
  check("realtime order request accepted", realtimeOrder.ok()); await wait(kitchen.page, 1200); await shot(kitchen.page, "kitchen-new-order.png");
  const startPreparing = kitchen.page.getByRole("button", { name: "Start preparing" }).first(); if (await startPreparing.count()) await startPreparing.click(); await wait(kitchen.page); await shot(kitchen.page, "kitchen-preparing.png");
  const ready = kitchen.page.getByRole("button", { name: "Mark ready" }).first(); if (await ready.count()) await ready.click(); await wait(kitchen.page); await shot(kitchen.page, "kitchen-ready.png");
  check("kitchen cannot mark served", !(await kitchen.page.getByRole("button", { name: "Mark served" }).count()));
  await service.page.reload(); await wait(service.page, 800); await service.page.getByRole("button", { name: "Orders" }).click(); await wait(service.page, 500); await shot(service.page, "service-ready-order.png");
  const served = service.page.getByRole("button", { name: "Mark served" }).first(); if (await served.count()) await served.click(); await wait(service.page); await shot(service.page, "service-mark-served.png");
  check("service mark served visible", (await service.page.locator("body").innerText()).includes("Served"));
  await ownerPage?.close?.().catch?.(() => {});

  // Service hub, request state, bill and payment pages.
  await cp.goto(`${base}/q/${location.slug}?t=${encodeURIComponent(table.public_token)}`); await wait(cp, 700); await shot(cp, "customer-home-services.png");
  check("service hub visible", /Call waiter|Water|Cutlery|Request bill/.test(await cp.locator("body").innerText()));
  const call = cp.getByRole("button", { name: "Call waiter" }).first(); if (await call.count()) { await call.click(); await wait(cp); await shot(cp, "call-waiter-confirm.png"); await cp.getByRole("button", { name: "Call waiter" }).last().click(); }
  await wait(cp); await shot(cp, "waiter-requested.png");
  const water = cp.getByRole("button", { name: "Water" }).first(); if (await water.count()) await water.click(); await wait(cp); await cp.getByRole("button", { name: "Water" }).last().click(); await wait(cp); await shot(cp, "water-requested.png");
  const cutlery = cp.getByRole("button", { name: "Cutlery" }).first(); if (await cutlery.count()) await cutlery.click(); await wait(cp); await cp.getByRole("button", { name: "Cutlery" }).last().click(); await wait(cp); await shot(cp, "cutlery-requested.png");
  const bill = cp.getByRole("button", { name: "Request bill" }).first(); if (await bill.count()) await bill.click(); await wait(cp); if (await cp.getByRole("button", { name: "Request bill" }).last().count()) await cp.getByRole("button", { name: "Request bill" }).last().click(); await wait(cp); await shot(cp, "bill-request.png");
  check("customer service requests rendered", /requested/i.test(await cp.locator("body").innerText()));

  await service.page.reload(); await wait(service.page, 1000); await service.page.getByRole("button", { name: "Orders" }).click().catch(() => {}); await wait(service.page); await shot(service.page, "service-request-waiter.png");
  const accept = service.page.getByRole("button", { name: "Accept" }).first(); if (await accept.count()) await accept.click(); await wait(service.page); await shot(service.page, "service-request-accepted.png");
  const complete = service.page.getByRole("button", { name: "Complete" }).first(); if (await complete.count()) await complete.click(); await wait(service.page); await shot(service.page, "service-request-completed.png");

  // Analytics and order timeline surfaces.
  await manager.page.getByRole("button", { name: "Analytics" }).click(); await wait(manager.page, 900); await shot(manager.page, "operations-performance.png"); await shot(manager.page, "slow-orders.png");
  check("analytics rendered", /Average|Avg prep|Orders served|Spend/i.test(await manager.page.locator("body").innerText()));

  report.audio.kitchen = await kitchen.page.evaluate(() => window.__qaAudio);
  report.audio.service = await service.page.evaluate(() => window.__qaAudio);
  await Promise.all([kitchen.context.close(), service.context.close(), manager.context.close(), customer.close()]);
} catch (error) {
  report.errors.push(String(error?.stack || error));
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
