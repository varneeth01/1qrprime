/**
 * Provisions the single internal production QA workspace.
 *
 * This command is intentionally hard to run by accident. It is not part of
 * application startup and it accepts no account or tenant identifiers from
 * the command line. Production access requires explicit operator confirmation
 * plus credentials supplied through the server environment.
 */
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { createPostgresDatabase } from "../apps/api/src/async-db.js";

const QA_CONFIRMATION = "OLIVE_AND_EMBER_QA";
const QA_BUSINESS = "Olive & Ember QA";
const QA_SLUG = "olive-and-ember-qa";

if (process.env.NODE_ENV !== "production") throw new Error("Production QA provisioning requires NODE_ENV=production");
if (process.env.DATABASE_DRIVER !== "postgres") throw new Error("Production QA provisioning requires DATABASE_DRIVER=postgres");
if (process.env.ALLOW_PRODUCTION_QA_PROVISIONING !== "true") throw new Error("Set ALLOW_PRODUCTION_QA_PROVISIONING=true for this one-time command");
if (process.env.PROD_QA_PROVISION_CONFIRM !== QA_CONFIRMATION) throw new Error("Set PROD_QA_PROVISION_CONFIRM=OLIVE_AND_EMBER_QA for this one-time command");

const ownerEmail = process.env.PROD_QA_OWNER_EMAIL?.trim().toLowerCase();
const ownerPassword = process.env.PROD_QA_OWNER_PASSWORD;
const managerEmail = process.env.PROD_QA_MANAGER_EMAIL?.trim().toLowerCase();
const managerPassword = process.env.PROD_QA_MANAGER_PASSWORD;
const staffEmail = process.env.PROD_QA_STAFF_EMAIL?.trim().toLowerCase();
const staffPassword = process.env.PROD_QA_STAFF_PASSWORD;
if (!ownerEmail || !ownerPassword || !managerEmail || !managerPassword || !staffEmail || !staffPassword)
  throw new Error("PROD_QA_OWNER_EMAIL/PASSWORD, PROD_QA_MANAGER_EMAIL/PASSWORD and PROD_QA_STAFF_EMAIL/PASSWORD are required");
if (new Set([ownerEmail, managerEmail, staffEmail]).size !== 3) throw new Error("QA owner and staff emails must be different");

const db = createPostgresDatabase(process.env.DATABASE_URL);
const id = () => randomUUID();
const token = () => randomBytes(24).toString("hex");
const staffPermissions = {
  orders: { view: true, update: true },
  menu: { view: true, edit: true },
  tables: { view: true, edit: true },
  analytics: { view: true },
};

async function upsertUser(email: string, password: string, accountType: "standard" | "internal_qa") {
  const existing = await db.get<{ id: string; account_type: string }>("SELECT id,account_type FROM users WHERE email=?", [email]);
  const userId = existing?.id || id();
  const passwordHash = await argon2.hash(password);
  await db.run(
    "INSERT INTO users(id,email,password,email_verified,account_type) VALUES (?,?,?,TRUE,?) ON CONFLICT(email) DO UPDATE SET password=excluded.password,email_verified=TRUE,account_type=excluded.account_type",
    [userId, email, passwordHash, accountType],
  );
  return userId;
}

try {
  // Preflight ownership before changing even the QA account marker. If the
  // supplied email is attached to a non-QA tenant, refuse with zero writes.
  const existingOwner = await db.get<{ id: string }>("SELECT id FROM users WHERE email=?", [ownerEmail]);
  if (existingOwner) {
    const existingTenants = await db.all<{ name: string }>(
      "SELECT t.name FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE m.user_id=? AND m.role='owner'",
      [existingOwner.id],
    );
    if (existingTenants.some((tenant) => tenant.name !== QA_BUSINESS))
      throw new Error("The configured QA owner already owns a non-QA tenant; refusing to modify production");
  }
  const ownerId = await upsertUser(ownerEmail, ownerPassword, "internal_qa");
  const ownerTenants = await db.all<{ id: string; name: string }>(
    "SELECT t.id,t.name FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE m.user_id=? AND m.role='owner'",
    [ownerId],
  );
  const unsafeTenant = ownerTenants.find((tenant) => tenant.name !== QA_BUSINESS);
  if (unsafeTenant) throw new Error("The configured QA owner already owns a non-QA tenant; refusing to modify production");
  const tenantId = ownerTenants.find((tenant) => tenant.name === QA_BUSINESS)?.id || id();
  await db.run(
    "INSERT INTO tenants(id,name,plan_id,billing_state,billing_source) VALUES (?,?,?, ?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,plan_id=excluded.plan_id,billing_state=excluded.billing_state,billing_source=excluded.billing_source",
    [tenantId, QA_BUSINESS, "prime", "active", "internal_qa"],
  );
  await db.run(
    "INSERT INTO memberships(user_id,tenant_id,role,permissions) VALUES (?,?,?,'{}') ON CONFLICT(user_id,tenant_id) DO UPDATE SET role='owner',permissions='{}'",
    [ownerId, tenantId, "owner"],
  );

  const existingLocation = await db.get<{ id: string; public_id: string }>("SELECT id,public_id FROM locations WHERE tenant_id=? LIMIT 1", [tenantId]);
  const locationId = existingLocation?.id || id();
  const publicId = existingLocation?.public_id || randomBytes(16).toString("hex");
  const profile = JSON.stringify({
    description: "Fictional QA restaurant for internal product testing.",
    address: "12 Sample Market Road, Tirupati QA",
    hours: "Monday–Sunday · 11:00–23:00",
    phone: "+919999000000",
    actions: [], orderEnabled: true, requestEnabled: false, payAtCounter: true,
    orderTypes: ["dine_in", "takeaway"], manualClosed: false, showSoldOut: true,
    packagingFeePaise: 0, serviceFeePaise: 0, deliveryFeePaise: 0, taxBps: 0,
    minimumOrderPaise: 0, estimatedPreparationMinutes: 25, appearance: {},
  });
  await db.run(
    "INSERT INTO locations(id,tenant_id,slug,public_id,name,category,profile,published,status,onboarding_step,onboarding_completed) VALUES (?,?,?,?,?,?,?,TRUE,'ACTIVE',6,TRUE) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,name=excluded.name,category=excluded.category,profile=excluded.profile,published=TRUE,status='ACTIVE',onboarding_step=6,onboarding_completed=TRUE",
    [locationId, tenantId, QA_SLUG, publicId, QA_BUSINESS, "restaurant", profile],
  );

  const staff = [
    { email: managerEmail, password: managerPassword, name: "QA Manager", role: "manager" },
    { email: staffEmail, password: staffPassword, name: "QA Staff", role: "staff" },
  ] as const;
  for (const member of staff) {
    const userId = await upsertUser(member.email, member.password, "standard");
    await db.run(
      "INSERT INTO memberships(user_id,tenant_id,role,permissions) VALUES (?,?,?,?) ON CONFLICT(user_id,tenant_id) DO UPDATE SET role=excluded.role,permissions=excluded.permissions",
      [userId, tenantId, member.role, JSON.stringify(staffPermissions)],
    );
  }

  await db.run(
    "INSERT INTO audit(id,tenant_id,actor_id,action,record_id,detail) VALUES (?,?,?,?,?,?)",
    [id(), tenantId, ownerId, "qa.internal_provisioned", tenantId, JSON.stringify({ source: "INTERNAL_QA", business: QA_BUSINESS })],
  );
  console.log(JSON.stringify({ ok: true, email: ownerEmail, business: QA_BUSINESS, slug: QA_SLUG, owner: "internal_qa", entitlement: "active", source: "internal_qa" }, null, 2));
} finally {
  await db.close();
}
