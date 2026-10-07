import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
await mkdir("artifacts/screenshots", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const suffix = Date.now().toString().slice(-8),
  slug = `mango-cafe-${suffix}`,
  email = `qa-${suffix}@example.test`,
  password = `QA-${randomUUID()}`;
const results = [];
const pass = (name) => {
  results.push({ name, status: "PASS" });
  console.log(`PASS ${name}`);
};
try {
  await page.goto("http://localhost:5173");
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await page.screenshot({
    path: "artifacts/screenshots/sign-in-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "New to 1QR Prime? Create an account" })
    .click();
  await page.getByLabel("Business / organisation name").fill("Mango & Co.");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Mango & Co. Café");
  await page.getByLabel("Permanent page URL").fill(slug);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("heading", { name: "Tell customers about you" }).waitFor();
  await page.getByLabel("Description", { exact: true }).fill("Slow mornings. Good coffee. Freshly made favourites, right here in your neighbourhood.");
  await page.getByLabel("Phone number", { exact: true }).fill("+919876543210");
  await page.getByLabel("Address", { exact: true }).fill("Jubilee Hills, Hyderabad");
  await page.getByLabel("Opening hours", { exact: true }).fill("Monday–Sunday · 8 am–9 pm");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("heading", { name: "Configure your experience" }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("heading", { name: "Add your menu" }).waitFor();
  pass("signup and location creation through UI");
  await page.getByLabel("Item name", { exact: true }).fill("South Indian filter coffee");
  await page.getByLabel("Price (₹)", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByText("South Indian filter coffee", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("heading", { name: "Preview your 1QR page" }).waitFor();
  await page.getByRole("button", { name: "Publish Business", exact: true }).click();
  await page.getByRole("heading", { name: "Your business is live 🎉" }).waitFor();
  await page.getByRole("button", { name: "Go to Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Business page", exact: true }).click();
  await page
    .getByLabel("description", { exact: true })
    .fill(
      "Slow mornings. Good coffee. Freshly made favourites, right here in your neighbourhood.",
    );
  await page
    .getByLabel("address", { exact: true })
    .fill("Jubilee Hills, Hyderabad");
  await page
    .getByLabel("hours", { exact: true })
    .fill("Monday–Sunday · 8 am–9 pm");
  await page.getByLabel("Publish customer page").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "Catalogue & menu", exact: true })
    .click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("South Indian filter coffee");
  await page.getByLabel("Section", { exact: true }).fill("From the coffee bar");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Our house blend, slow brewed and served in a brass tumbler.");
  await page.getByLabel("Price (₹)", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await page.getByText("South Indian filter coffee", { exact: true }).waitFor();
  pass("profile publishing and menu persistence");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "artifacts/screenshots/merchant-overview.png",
    fullPage: true,
  });
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const customer = await customerContext.newPage();
  customer.on("pageerror", (e) => errors.push(e.message));
  await customer.goto(`http://localhost:5173/q/${slug}?source=qr`);
  await customer.getByRole("heading", { name: "Mango & Co. Café", exact: true }).waitFor();
  await expect(customer.getByRole("button", { name: /View Menu/ })).toBeVisible();
  await expect(customer.getByText("South Indian filter coffee", { exact: true })).toHaveCount(0);
  await customer.getByRole("button", { name: /View Menu/ }).click();
  await customer.getByPlaceholder("Search the menu").waitFor();
  await customer.goBack();
  await expect(customer.getByRole("button", { name: /View Menu/ })).toBeVisible();
  pass("public QR opens action hub before menu and browser back returns to hub");
  await customer.goto(`http://localhost:5173/b/${slug}?source=qr`);
  await customer
    .getByRole("heading", { name: "Mango & Co. Café", exact: true })
    .waitFor();
  await customer
    .getByRole("button", { name: "Add South Indian filter coffee" })
    .first()
    .click();
  await expect(
    customer.getByRole("button", { name: "Submit order · ₹90.00" }),
  ).toBeVisible();
  await customer.screenshot({
    path: "artifacts/screenshots/customer-menu-mobile.png",
    fullPage: true,
  });
  await customer.getByRole("button", { name: "Submit order · ₹90.00" }).click();
  await customer
    .getByText("Received. Waiting for the business to accept your order.")
    .waitFor();
  await customer.reload();
  await customer
    .getByText("Received. Waiting for the business to accept your order.")
    .waitFor();
  pass("mobile customer cart, submission, reload recovery and INR formatting");
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page.getByRole("button", { name: "accepted", exact: true }).waitFor();
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page.getByRole("button", { name: "accepted", exact: true }).click();
  await expect(customer.getByText("Your order is accepted.")).toBeVisible({
    timeout: 10000,
  });
  pass("live manager-to-customer order status");
  await page.screenshot({
    path: "artifacts/screenshots/order-desk-desktop.png",
    fullPage: true,
  });
  await page.route("**/api/locations/*/orders", (route) => route.abort());
  await expect(
    page.getByText("Reconnecting · retrying every 4s", { exact: false }),
  ).toBeVisible({ timeout: 10000 });
  await page.unroute("**/api/locations/*/orders");
  await expect(
    page.getByText("Polling · connected", { exact: false }),
  ).toBeVisible({ timeout: 10000 });
  pass("manager disconnect indicator and polling recovery");
  await page.getByRole("button", { name: "QR studio", exact: true }).click();
  await expect(
    page.getByAltText("Mango & Co. Café page QR code"),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "PNG", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs("artifacts/screenshots/business-qr.png");
  pass("authenticated QR download");
  const mobileOverflow = await customer.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(mobileOverflow).toBe(false);
  pass("390px mobile layout without horizontal overflow");
  const axe = await new AxeBuilder({ page: customer })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await writeFile(
    "artifacts/customer-accessibility.json",
    JSON.stringify(axe.violations, null, 2),
  );
  expect(axe.violations).toEqual([]);
  pass("customer automated WCAG A/AA checks");
  const merchantAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await writeFile(
    "artifacts/merchant-accessibility.json",
    JSON.stringify(merchantAxe.violations, null, 2),
  );
  expect(merchantAxe.violations).toEqual([]);
  pass("merchant QR studio automated WCAG A/AA checks");
  expect(errors).toEqual([]);
  pass("no browser runtime errors");
  await customerContext.close();
} catch (e) {
  results.push({ name: "browser workflow", status: "FAIL", error: e.message });
  await page.screenshot({
    path: "artifacts/screenshots/failure.png",
    fullPage: true,
  });
  process.exitCode = 1;
  console.error(e);
} finally {
  await writeFile(
    "artifacts/web-test-report.json",
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  await browser.close();
}
