import { chromium } from "playwright";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

const base = "http://localhost:5173";
const out = "qa/final-design";
mkdirSync(out, { recursive: true });
const db = new Database("apps/api/data/prime.sqlite");
const location = db.prepare("SELECT slug FROM locations WHERE slug='olive-and-ember-qa'").get();
const table = db.prepare("SELECT public_token FROM restaurant_tables WHERE location_id=(SELECT id FROM locations WHERE slug='olive-and-ember-qa') AND enabled=1 ORDER BY name LIMIT 1").get();
db.close();
const pass = { owner: "QA-owner-pass-123!", kitchen: "QA-role-pass-123!", service: "QA-role-pass-123!" };
const email = { owner: "qa.owner@1qrprime.local", kitchen: "qa.kitchen@1qrprime.local", service: "qa.service@1qrprime.local" };
const browser = await chromium.launch({ headless: true });
const files = [];
async function snap(page, name, fullPage = false) { await page.screenshot({ path: `${out}/${name}`, fullPage }); files.push(name); }
async function signedIn(role, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email address").fill(email[role]);
  await page.getByLabel("Password").fill(pass[role]);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(900);
  return { context, page };
}
async function nav(page, name) { const button = page.getByRole("button", { name, exact: true }); if (await button.count()) { await button.click(); await page.waitForTimeout(500); } }

const owner = await signedIn("owner", { width: 1440, height: 900 });
await snap(owner.page, "overview-desktop.png");
await nav(owner.page, "Orders"); await snap(owner.page, "orders-desktop.png");
const detail = owner.page.getByRole("button", { name: "View order detail" }).first();
if (await detail.count()) { await detail.click(); await owner.page.waitForTimeout(400); }
await snap(owner.page, "order-detail-desktop.png");
await nav(owner.page, "Analytics"); await snap(owner.page, "analytics-desktop.png");
await nav(owner.page, "Staff"); await snap(owner.page, "staff-desktop.png");
await nav(owner.page, "Settings"); await snap(owner.page, "settings-desktop.png");

const kitchen = await signedIn("kitchen", { width: 768, height: 1024 });
await nav(kitchen.page, "Orders");
let start = kitchen.page.getByRole("button", { name: /Start Kitchen Mode/ }); if (await start.count()) await start.click();
await kitchen.page.waitForTimeout(700); await snap(kitchen.page, "kitchen-new-tablet.png");
const preparing = kitchen.page.getByRole("button", { name: "Start preparing" }).first(); if (await preparing.count()) { await preparing.click(); await kitchen.page.waitForTimeout(400); }
await snap(kitchen.page, "kitchen-preparing-tablet.png");
const ready = kitchen.page.getByRole("button", { name: "Mark ready" }).first(); if (await ready.count()) { await ready.click(); await kitchen.page.waitForTimeout(400); }
await snap(kitchen.page, "kitchen-ready-tablet.png");

const service = await signedIn("service", { width: 768, height: 1024 });
await nav(service.page, "Service requests"); await snap(service.page, "service-requests-tablet.png");
await nav(service.page, "Orders"); await snap(service.page, "service-ready-tablet.png");

const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
await customer.addInitScript(() => { localStorage.clear(); });
const cp = await customer.newPage();
const query = `?t=${encodeURIComponent(table.public_token)}`;
await cp.goto(`${base}/q/${location.slug}${query}`); await cp.waitForTimeout(1100); await snap(cp, "customer-home.png");
const menu = cp.getByRole("button", { name: /View Menu/ }).first(); if (await menu.count()) await menu.click(); await cp.waitForTimeout(500); await snap(cp, "customer-menu.png");
const add = cp.getByRole("button", { name: /Add / }).first(); if (await add.count()) await add.click(); await cp.waitForTimeout(300); await snap(cp, "customer-cart.png");
const review = cp.getByRole("button", { name: /Review order|Place order/ }).first(); if (await review.count()) { await review.click(); await cp.waitForTimeout(300); }
await snap(cp, "customer-slider.png");
await cp.goto(`${base}/q/${location.slug}${query}`); await cp.waitForTimeout(700); await cp.getByRole("button", { name: /View Menu/ }).first().click(); await cp.waitForTimeout(400);
const firstAdd = cp.getByRole("button", { name: /Add / }).first(); if (await firstAdd.count()) await firstAdd.click();
const reviewAgain = cp.getByRole("button", { name: /Review order/ }).first(); if (await reviewAgain.count()) await reviewAgain.click(); await cp.waitForTimeout(300);
await snap(cp, "customer-order-tracking.png");
await cp.goto(`${base}/q/${location.slug}${query}`); await cp.waitForTimeout(700); await snap(cp, "customer-service-request.png");
const pay = cp.getByRole("button", { name: /Pay now/ }).first(); if (await pay.count()) { await pay.click(); await cp.waitForTimeout(300); }
await snap(cp, "customer-pay.png");
await cp.goto(`${base}/q/${location.slug}${query}`); await cp.waitForTimeout(700);
const bill = cp.getByRole("button", { name: /Request bill/ }).first(); if (await bill.count()) { await bill.click(); await cp.waitForTimeout(200); const confirm = cp.getByRole("button", { name: /Request bill/ }).last(); if (await confirm.count()) await confirm.click(); await cp.waitForTimeout(500); }
const viewBill = cp.getByRole("button", { name: /View bill/ }).last(); if (await viewBill.count()) await viewBill.click(); await cp.waitForTimeout(300); await snap(cp, "customer-bill.png");

await owner.context.close(); await kitchen.context.close(); await service.context.close(); await customer.close(); await browser.close();
console.log(JSON.stringify({ files }, null, 2));
