import argon2 from "argon2";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { openDb } from "../apps/api/src/db.js";

function loadQaEnv() {
  const path = process.env.QA_ENV_PATH || ".env.qa.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^("|')(.*)\1$/, "$2");
  }
}

loadQaEnv();
if (process.env.NODE_ENV === "production") {
  throw new Error("QA fixture seeding is disabled in production");
}

const ownerEmail = process.env.QA_OWNER_EMAIL || "qa.owner@1qrprime.local";
const ownerPassword = process.env.QA_OWNER_PASSWORD;
if (!ownerPassword) throw new Error("QA_OWNER_PASSWORD is required through .env.qa.local or the environment");

const db = openDb(process.env.DATABASE_PATH || "apps/api/data/prime.sqlite");
const id = () => randomUUID();
const token = () => randomBytes(24).toString("hex");
const now = new Date();
const stamp = (offsetMinutes = 0) => new Date(now.getTime() - offsetMinutes * 60000).toISOString().slice(0, 19).replace("T", " ");
const profile = {
  description: "Modern neighbourhood dining with seasonal plates, coffee and handcrafted drinks.",
  address: "12 Sample Market Road, Tirupati QA",
  hours: "Monday–Sunday · 11:00–23:00",
  phone: "+919999000000",
  actions: [
    { label: "Directions", url: "https://maps.google.com/?q=Olive%20and%20Ember%20QA" },
    { label: "Website", url: "https://example.com/olive-and-ember-qa" },
  ],
  orderEnabled: true,
  requestEnabled: false,
  payAtCounter: true,
  orderTypes: ["dine_in", "takeaway"],
  manualClosed: false,
  showSoldOut: true,
  packagingFeePaise: 2000,
  serviceFeePaise: 0,
  deliveryFeePaise: 0,
  taxBps: 500,
  minimumOrderPaise: 0,
  estimatedPreparationMinutes: 25,
  googleReviewUrl: null,
  instagramUrl: "https://instagram.com/oliveandember.qa",
  facebookUrl: null,
  youtubeUrl: null,
  xUrl: null,
  linkedinUrl: null,
  websiteUrl: "https://example.com/olive-and-ember-qa",
  directionsUrl: "https://maps.google.com/?q=Olive%20and%20Ember%20QA",
  whatsappNumber: "+919999000000",
  appearance: {
    themePreset: "warm",
    layoutPreset: "restaurant",
    primaryColor: "#174f43",
    secondaryColor: "#deedaf",
    backgroundColor: "#f6f7f4",
    textColor: "#202f2c",
    buttonColor: "#174f43",
    buttonTextColor: "#ffffff",
    logoUrl: null,
    coverUrl: null,
    actionOrder: ["Menu", "Pay", "Directions", "Website"],
    hiddenActions: [],
  },
};

const menu = [
  ["Crispy Corn", "Starters", 18900, "VEG", true, "Sweet corn, peppers and a light chilli glaze.", true],
  ["Truffle Fries", "Starters", 24900, "VEG", true, "Crisp fries, truffle oil and parmesan.", false],
  ["Paneer Tikka", "Starters", 29900, "VEG", true, "Charred paneer with smoked pepper chutney.", true],
  ["Smoky Alfredo Pasta", "Mains", 37900, "VEG", true, "Creamy roasted garlic sauce and herbs.", false],
  ["Garden Pesto Pizza", "Mains", 42900, "VEG", true, "Basil pesto, vegetables and mozzarella.", true],
  ["Classic Veg Burger", "Mains", 32900, "VEG", true, "House patty, lettuce, tomato and fries.", false],
  ["Seasonal Grain Bowl with a Very Long Descriptive Name", "Mains", 39900, "VEGAN", false, "A colourful bowl of grains, greens and roasted vegetables.", false],
  ["Cold Coffee", "Drinks", 16900, "VEG", true, "Chilled coffee with a soft vanilla finish.", false],
  ["Lime Soda", "Drinks", 9900, "VEG", true, "Fresh lime, soda and a pinch of sea salt.", false],
  ["Tiramisu", "Desserts", 24900, "VEG", true, "Mascarpone, espresso and cocoa.", true],
  ["Chocolate Lava Cake", "Desserts", 28900, "VEG", true, "Warm chocolate cake with a molten centre.", false],
  ["Mango Panna Cotta", "Desserts", 21900, "VEG", true, "Silky panna cotta with seasonal mango.", false],
] as const;

const ownerHash = await argon2.hash(ownerPassword);
const managerHash = await argon2.hash(`${randomUUID()}-manager`);
const staffHash = await argon2.hash(`${randomUUID()}-staff`);
const managerEmail = "qa.manager@1qrprime.local";
const staffEmail = "qa.staff@1qrprime.local";

const owner = db.prepare("SELECT id FROM users WHERE email=?").get(ownerEmail) as { id: string } | undefined;
const tenant = owner
  ? db.prepare("SELECT t.id FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE m.user_id=? AND m.role='owner' LIMIT 1").get(owner.id) as { id: string } | undefined
  : undefined;
const ownerId = owner?.id || id();
const tenantId = tenant?.id || id();
const location = db.prepare("SELECT id FROM locations WHERE tenant_id=? LIMIT 1").get(tenantId) as { id: string } | undefined;
const locationId = location?.id || id();

const cleanup = db.transaction(() => {
  const locations = db.prepare("SELECT id FROM locations WHERE tenant_id=?").all(tenantId) as { id: string }[];
  for (const row of locations) {
    db.prepare("DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE location_id=?))").run(row.id);
    db.prepare("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE location_id=? )").run(row.id);
    db.prepare("DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE location_id=? )").run(row.id);
    db.prepare("DELETE FROM attempts WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM orders WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM events WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM outbox WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM reports WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM requests WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM table_staff_assignments WHERE table_id IN (SELECT id FROM restaurant_tables WHERE location_id=? )").run(row.id);
    db.prepare("DELETE FROM restaurant_tables WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM routes WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM menu_item_modifier_groups WHERE item_id IN (SELECT id FROM items WHERE location_id=? )").run(row.id);
    db.prepare("DELETE FROM menu_item_variants WHERE item_id IN (SELECT id FROM items WHERE location_id=? )").run(row.id);
    db.prepare("DELETE FROM modifiers WHERE group_id IN (SELECT id FROM modifier_groups WHERE location_id=? )").run(row.id);
    db.prepare("DELETE FROM modifier_groups WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM items WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM menu_categories WHERE location_id=?").run(row.id);
    db.prepare("DELETE FROM locations WHERE id=?").run(row.id);
  }
  db.prepare("DELETE FROM staff_invitations WHERE tenant_id=?").run(tenantId);
  db.prepare("DELETE FROM memberships WHERE tenant_id=? AND user_id<>?").run(tenantId, ownerId);
  db.prepare("DELETE FROM login_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qa.%@1qrprime.local')").run();
  db.prepare("DELETE FROM users WHERE email IN (?,?)").run(managerEmail, staffEmail);
  db.prepare("DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email IN (?,?))").run(managerEmail, staffEmail);
  db.prepare("INSERT INTO users(id,email,password,email_verified,account_type) VALUES (?,?,?,1,'internal_qa') ON CONFLICT(email) DO UPDATE SET password=excluded.password,email_verified=1,account_type='internal_qa'").run(ownerId, ownerEmail, ownerHash);
  db.prepare("INSERT INTO tenants(id,name,plan_id,billing_state,billing_source) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,plan_id=excluded.plan_id,billing_state=excluded.billing_state,billing_source=excluded.billing_source").run(tenantId, "Olive & Ember", "prime", "active", "internal_qa");
  db.prepare("INSERT INTO memberships(user_id,tenant_id,role,permissions) VALUES (?,?,?,'{}') ON CONFLICT(user_id,tenant_id) DO UPDATE SET role='owner',permissions='{}'").run(ownerId, tenantId, "owner");
  db.prepare("INSERT INTO locations(id,tenant_id,slug,public_id,name,category,profile,published,status,onboarding_step,onboarding_completed) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(locationId, tenantId, "olive-and-ember-qa", `qa-${randomBytes(8).toString("hex")}`, "Olive & Ember", "restaurant", JSON.stringify(profile), 1, "ACTIVE", 6, 1);
});
cleanup();

const categoryIds = new Map<string, string>();
for (const [displayOrder, name] of ["Starters", "Mains", "Drinks", "Desserts"].entries()) {
  const categoryId = id();
  categoryIds.set(name, categoryId);
  db.prepare("INSERT INTO menu_categories(id,location_id,name,description,display_order) VALUES (?,?,?,?,?)").run(categoryId, locationId, name, `${name} from the Olive & Ember kitchen.`, displayOrder);
}
const itemIds: string[] = [];
for (const [displayOrder, [name, section, price, foodType, available, description, featured]] of menu.entries()) {
  const itemId = id(); itemIds.push(itemId);
  db.prepare("INSERT INTO items(id,location_id,name,description,section,price_paise,available,category_id,display_order,food_type,tags,prep_minutes,stock_status,featured,recommended) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(itemId, locationId, name, description, section, price, available ? 1 : 0, categoryIds.get(section), displayOrder, foodType, JSON.stringify(featured ? ["featured"] : []), 15 + (displayOrder % 4) * 5, available ? "AVAILABLE" : "SOLD_OUT", featured ? 1 : 0, featured ? 1 : 0);
}
db.prepare("INSERT INTO routes(id,location_id,label,provider,vpa,payee,state) VALUES (?,?,?,?,?,?,?)").run(id(), locationId, "QA payment destination", "basic_upi", "oliveemberqa@upi", "Olive & Ember QA", "verification_pending");
const tables: string[] = [];
for (let index = 1; index <= 5; index++) { const tableId = id(); tables.push(tableId); db.prepare("INSERT INTO restaurant_tables(id,location_id,name,public_token) VALUES (?,?,?,?)").run(tableId, locationId, `Table ${index}`, token()); }

const staff = [
  [managerEmail, "QA Manager", managerHash, JSON.stringify({ orders: { view: true, update: true }, menu: { view: true, edit: true }, tables: { view: true, edit: true }, analytics: { view: true } })],
  [staffEmail, "QA Staff", staffHash, JSON.stringify({ orders: { view: true, update: true }, menu: { view: true }, tables: { view: true } })],
] as const;
const staffIds: string[] = [];
for (const [email, name, passwordHash, permissions] of staff) {
  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email) as { id: string } | undefined;
  const staffId = existing?.id || id(); staffIds.push(staffId);
  db.prepare("INSERT INTO users(id,email,password,email_verified,account_type) VALUES (?,?,?,1,'standard') ON CONFLICT(email) DO UPDATE SET password=excluded.password,email_verified=1,account_type='standard'").run(staffId, email, passwordHash);
  db.prepare("INSERT INTO memberships(user_id,tenant_id,role,permissions) VALUES (?,?,?,?) ON CONFLICT(user_id,tenant_id) DO UPDATE SET role=excluded.role,permissions=excluded.permissions").run(staffId, tenantId, email === managerEmail ? "manager" : "staff", permissions);
}
db.prepare("INSERT INTO table_staff_assignments(table_id,user_id,tenant_id) VALUES (?,?,?)").run(tables[0], staffIds[0], tenantId);
db.prepare("INSERT INTO table_staff_assignments(table_id,user_id,tenant_id) VALUES (?,?,?)").run(tables[1], staffIds[1], tenantId);

const states = ["submitted", "accepted", "preparing", "ready", "completed", "cancelled"];
for (let index = 0; index < states.length; index++) {
  const orderId = id();
  const itemId = itemIds[index % itemIds.length];
  const item = db.prepare("SELECT name,price_paise FROM items WHERE id=?").get(itemId) as { name: string; price_paise: number };
  const tableId = tables[index % tables.length];
  const tableName = `Table ${(index % tables.length) + 1}`;
  const quantity = (index % 3) + 1;
  const amount = item.price_paise * quantity + 2000;
  const lines = JSON.stringify([{ itemId, name: item.name, quantity, pricePaise: item.price_paise, modifiers: [], customerNote: "" }]);
  db.prepare("INSERT INTO orders(id,location_id,idempotency_key,request_hash,access_token,state,amount_paise,lines,instructions,order_type,payment_method,public_order_number,customer_tracking_token,table_id,table_name_snapshot,customer_name,customer_phone,delivery_address,landmark,tax_paise,packaging_fee_paise,service_fee_paise,delivery_fee_paise,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(orderId, locationId, `qa-${index}`, `qa-${index}`, token(), states[index], amount, lines, index === 0 ? "Less spicy" : "", "dine_in", "counter", `QA-${1001 + index}`, token(), tableId, tableName, ["Anika", "Rohan", "Maya", "Kabir", "Ishita", "Dev"][index], "+919999000000", "", "", Math.round(amount * 0.05), 2000, 0, 0, "INR", stamp(index * 48), stamp(index * 36));
  db.prepare("INSERT INTO order_items(id,order_id,menu_item_id,item_name_snapshot,unit_price_snapshot,quantity,line_total,customer_note) VALUES (?,?,?,?,?,?,?,?)").run(id(), orderId, itemId, item.name, item.price_paise, quantity, item.price_paise * quantity, "");
  db.prepare("INSERT INTO order_events(id,order_id,state,created_at) VALUES (?,?,?,?)").run(id(), orderId, states[index], stamp(index * 36));
  db.prepare("INSERT INTO events(location_id,day,kind,count) VALUES (?,date(?),?,1) ON CONFLICT(location_id,day,kind) DO UPDATE SET count=events.count+1").run(locationId, stamp(index * 48), "order_submitted");
}

db.close();
console.log(JSON.stringify({ ok: true, email: ownerEmail, business: "Olive & Ember", slug: "olive-and-ember-qa", menuItems: menu.length, tables: tables.length, orders: states.length, staff: staff.length, source: "internal_qa", environment: process.env.NODE_ENV || "development" }, null, 2));
