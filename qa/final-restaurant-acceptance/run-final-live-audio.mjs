import { chromium } from "playwright";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const base = "http://localhost:5173";
const out = "qa/final-restaurant-acceptance/final-closure";
mkdirSync(out, { recursive: true });
const db = new Database("apps/api/data/prime.sqlite");
const location = db.prepare("SELECT id,slug FROM locations WHERE slug='olive-and-ember-qa'").get();
const table = db.prepare("SELECT id,public_token FROM restaurant_tables WHERE location_id=? AND enabled=1 ORDER BY name LIMIT 1").get(location.id);
const menu = Object.fromEntries(db.prepare("SELECT id,name FROM items WHERE location_id=? AND name IN ('Paneer Tikka','Cold Coffee')").all(location.id).map((x) => [x.name, x]));
db.close();

const users = {
  kitchen: ["qa.kitchen@1qrprime.local", "QA-role-pass-123!"],
  service: ["qa.service@1qrprime.local", "QA-role-pass-123!"]
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const result = { screenshots: [], audio: {}, checks: [] };
const check = (name, pass, detail = "") => result.checks.push({ name, pass: !!pass, detail });

async function login(browser, [email, password]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.__qaAudio = { speak: [], play: 0 };
    const original = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
    if (original) window.speechSynthesis.speak = (utterance) => { window.__qaAudio.speak.push(String(utterance.text || "")); return original(utterance); };
    else window.speechSynthesis = { speak: (utterance) => window.__qaAudio.speak.push(String(utterance.text || "")), cancel() {} };
  });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(1000);
  return { context, page };
}

async function startKitchen(page) {
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page.waitForTimeout(900);
  const start = page.getByRole("button", { name: /Start Kitchen Mode/ });
  if (await start.count()) await start.click();
  const voice = page.getByRole("button", { name: /Voice off/ });
  if (await voice.count()) await voice.click();
  await page.waitForTimeout(1200);
}

async function createOrder(context, itemId) {
  const response = await context.request.post(`http://localhost:3001/api/public/${location.slug}/orders`, {
    data: { idempotencyKey: randomUUID(), lines: [{ itemId, quantity: 1 }], orderType: "dine_in", paymentMethod: "counter", tableId: table.id, tableToken: table.public_token, customerName: "Final QA", customerPhone: "+919876543210" }
  });
  return { status: response.status(), json: await response.json() };
}

const browser = await chromium.launch({ headless: true });
try {
  const kitchen = await login(browser, users.kitchen);
  const service = await login(browser, users.service);
  await kitchen.page.evaluate((id) => { localStorage.setItem(`kitchen-sound:${id}`, "on"); localStorage.setItem(`kitchen-voice:${id}`, "on"); }, location.id);
  await kitchen.page.reload();
  await startKitchen(kitchen.page);
  await kitchen.page.evaluate(() => { window.__qaAudio.speak = []; });

  const a = await createOrder(kitchen.context, menu["Paneer Tikka"].id);
  await kitchen.page.waitForTimeout(5500);
  const aInitial = await kitchen.page.evaluate(() => window.__qaAudio.speak.length);

  await kitchen.page.reload();
  await kitchen.page.waitForTimeout(1200);
  await startKitchen(kitchen.page);
  const afterReconnectBeforeNew = await kitchen.page.evaluate(() => window.__qaAudio.speak.length);
  await kitchen.page.evaluate(() => { window.__qaAudio.speak = []; });

  const b = await createOrder(kitchen.context, menu["Paneer Tikka"].id);
  await kitchen.page.waitForTimeout(5500);
  const bCount = await kitchen.page.evaluate(() => window.__qaAudio.speak.length);
  await kitchen.page.screenshot({ path: `${out}/kitchen-after-reconnect-order-b.png`, fullPage: true });

  await kitchen.page.evaluate(() => { window.__qaAudio.speak = []; });
  const c = await createOrder(kitchen.context, menu["Paneer Tikka"].id);
  await kitchen.page.waitForTimeout(5500);
  const cCount = await kitchen.page.evaluate(() => window.__qaAudio.speak.length);
  result.audio.reconnect = { createA: a.status, createB: b.status, createC: c.status, orderAInitial: aInitial, orderAAfterReconnect: afterReconnectBeforeNew, orderBAfterReconnect: bCount, orderCAfterReconnect: cCount };
  check("kitchen reconnect subscription", aInitial === 1 && afterReconnectBeforeNew === 0 && bCount === 1 && cCount === 1, JSON.stringify(result.audio.reconnect));

  await kitchen.page.evaluate(() => { window.__qaAudio.speak = []; });
  const cancel = await createOrder(kitchen.context, menu["Cold Coffee"].id);
  await kitchen.page.waitForTimeout(1200);
  const cancelDb = new Database("apps/api/data/prime.sqlite");
  const item = cancelDb.prepare("SELECT id FROM order_items WHERE order_id=? LIMIT 1").get(cancel.json.id);
  cancelDb.close();
  const cancelResponse = await service.context.request.post(`http://localhost:3001/api/locations/${location.id}/orders/${cancel.json.id}/items/${item.id}/cancel`, {
    data: { quantity: 1, idempotencyKey: randomUUID(), reason: "Customer requested", note: "", override: false }
  });
  await kitchen.page.waitForTimeout(5500);
  const cancelSpeech = await kitchen.page.evaluate(() => window.__qaAudio.speak);
  const body = await kitchen.page.locator("body").innerText();
  await kitchen.page.screenshot({ path: `${out}/kitchen-cancelled-item.png`, fullPage: true });
  result.audio.cancellation = { cancelStatus: cancelResponse.status(), speech: cancelSpeech };
  check("kitchen cancellation realtime", /Cancelled/i.test(body) && cancelResponse.ok(), body.match(/.{0,40}Cancelled.{0,80}/i)?.[0] || body.slice(0, 200));
  check("kitchen cancellation TTS", cancelSpeech.some((text) => /cancelled/i.test(text) && /Cold Coffee/i.test(text) && /phone|payment|refund|uuid|manager/i.test(text) === false), JSON.stringify(cancelSpeech));

  await kitchen.page.reload();
  await kitchen.page.waitForTimeout(1200);
  await startKitchen(kitchen.page);
  const cancelAfterReconnect = await kitchen.page.evaluate(() => window.__qaAudio.speak.length);
  result.audio.cancellation.afterReconnect = cancelAfterReconnect;
  check("cancellation TTS reconnect dedup", cancelAfterReconnect === 0, String(cancelAfterReconnect));

  await kitchen.context.close();
  await service.context.close();
} catch (error) {
  result.error = String(error?.stack || error);
} finally {
  await browser.close();
}
console.log(JSON.stringify(result, null, 2));
