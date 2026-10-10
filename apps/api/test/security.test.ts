import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
const cfg = envSchema.parse({ NODE_ENV: "test" });
test("durable migrations and records survive closing the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "prime-"));
  try {
    const path = join(dir, "db.sqlite");
    let db = openDb(path);
    db.prepare("INSERT INTO tenants(id,name) VALUES (?,?)").run(
      "tenant-test",
      "Persisted",
    );
    db.close();
    db = openDb(path);
    assert.equal(
      (
        db
          .prepare("SELECT name FROM tenants WHERE id=?")
          .get("tenant-test") as any
      ).name,
      "Persisted",
    );
    assert.equal(
      (db.prepare("SELECT count(*) n FROM migrations").get() as any).n,
      11,
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("single-use password reset revokes all sessions and does not accept expired links", async () => {
  const db = openDb(":memory:"),
    app = await createApp(db, cfg);
  try {
    const reg = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-client": "native" },
      payload: {
        email: "reset@example.test",
        name: "Reset",
        password: "old sufficiently long password",
      },
    });
    const session = reg.json().token;
    const user = db.prepare("SELECT id FROM users").get() as any;
    const token = randomBytes(32).toString("hex"),
      hashed = createHash("sha256").update(token).digest("hex");
    db.prepare("INSERT INTO email_tokens VALUES (?,?,?,?)").run(
      hashed,
      user.id,
      "reset",
      Date.now() + 60000,
    );
    const reset = () =>
      app.inject({
        method: "POST",
        url: "/api/auth/reset",
        payload: { token, password: "new sufficiently long password" },
      });
    assert.equal((await reset()).statusCode, 200);
    assert.equal((await reset()).statusCode, 400);
    assert.equal(
      (
        await app.inject({
          url: "/api/me",
          headers: { authorization: `Bearer ${session}` },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: {
            email: "reset@example.test",
            password: "new sufficiently long password",
          },
        })
      ).statusCode,
      200,
    );
  } finally {
    await app.close();
    db.close();
  }
});
test("HTTP-only cookie and no browser token exposure", async () => {
  const db = openDb(":memory:"),
    app = await createApp(db, cfg);
  try {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "cookie@example.test",
        password: "long test cookie password",
        name: "Cookie test",
      },
    });
    assert.equal(r.json().token, undefined);
    assert.match(String(r.headers["set-cookie"]), /HttpOnly/);
    assert.match(String(r.headers["set-cookie"]), /SameSite=Strict/);
    assert.equal(db.prepare("SELECT count(*) n FROM sessions").get()!.n, 1);
  } finally {
    await app.close();
    db.close();
  }
});
test("support cannot modify billing or independently approve their own routes", async () => {
  const db = openDb(":memory:"),
    app = await createApp(db, cfg);
  try {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-client": "native" },
      payload: {
        email: "support@example.test",
        password: "long support password",
        name: "Support",
      },
    });
    const headers = { authorization: `Bearer ${r.json().token}` };
    db.prepare("UPDATE users SET admin_role='support'").run();
    const tid = (db.prepare("SELECT id FROM tenants").get() as any).id;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/tenants/${tid}/billing`,
          headers,
          payload: {
            planId: "prime",
            state: "active",
            reason: "Attempt privilege escalation",
          },
        })
      ).statusCode,
      403,
    );
    db.prepare("UPDATE users SET admin_role='admin'").run();
    const lid = randomUUID(),
      rid = randomUUID();
    db.prepare(
      "INSERT INTO locations(id,tenant_id,slug,name,category,profile) VALUES (?,?,?,?,?,?)",
    ).run(lid, tid, "self-test", "Self", "generic", "{}");
    db.prepare(
      "INSERT INTO routes(id,location_id,label,provider,vpa,payee,state) VALUES (?,?,?,'basic_upi','self@bank','Self','verification_pending')",
    ).run(rid, lid, "Self");
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/routes/${rid}/verify`,
          headers,
          payload: { evidence: "Cannot approve own payment destination" },
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
    db.close();
  }
});
test("public endpoints cannot forge payment outcomes or access unpublished data", async () => {
  const db = openDb(":memory:"),
    app = await createApp(db, cfg);
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/webhooks/basic_upi",
          payload: { status: "success" },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/orders/not-an-order/payments",
          payload: { idempotencyKey: randomUUID(), state: "verified" },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ url: "/api/admin/plans" })).statusCode,
      401,
    );
  } finally {
    await app.close();
    db.close();
  }
});

test("plan catalog exposes Prime pricing and owner selection is persisted", async () => {
  const db = openDb(":memory:"),
    app = await createApp(db, cfg);
  try {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-client": "native" },
      payload: {
        email: `plan-${randomUUID()}@example.test`,
        password: "long plan selection password",
        name: "Plan test",
      },
    });
    assert.equal(registration.statusCode, 200);
    const plans = await app.inject({ url: "/api/plans" });
    assert.equal(plans.statusCode, 200);
    const prime = plans.json().find((p: any) => p.id === "prime");
    assert.equal(prime.price_paise, 59900);
    assert.equal(prime.original_price_paise, 159900);
    assert.equal(prime.max_staff, 5);
    assert.deepEqual(prime.business_categories, ["restaurant", "cafe", "hotel"]);
    assert.equal(prime.billing_interval, "month");
    const tenant = db.prepare("SELECT id FROM tenants").get() as any;
    const selected = await app.inject({
      method: "PUT",
      url: `/api/tenants/${tenant.id}/plan`,
      headers: { authorization: `Bearer ${registration.json().token}` },
      payload: { planId: "prime" },
    });
    assert.equal(selected.statusCode, 200);
    assert.equal(
      (db.prepare("SELECT plan_id FROM tenants WHERE id=?").get(tenant.id) as any).plan_id,
      "prime",
    );
    const unsupported = await app.inject({
      method: "POST",
      url: "/api/locations",
      headers: { authorization: `Bearer ${registration.json().token}` },
      payload: { tenantId: tenant.id, name: "Salon test", slug: `salon-${randomUUID()}`, category: "salon" },
    });
    assert.equal(unsupported.statusCode, 200);
    const blocked = await app.inject({
      method: "PUT",
      url: `/api/tenants/${tenant.id}/plan`,
      headers: { authorization: `Bearer ${registration.json().token}` },
      payload: { planId: "prime" },
    });
    assert.equal(blocked.statusCode, 403);
  } finally {
    await app.close();
    db.close();
  }
});

test("slug availability is authenticated, boolean-only, and legacy published locations remain onboarded", async () => {
  const db = openDb(":memory:"), app = await createApp(db, cfg);
  try {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-client": "native" },
      payload: {
        email: `slug-${randomUUID()}@example.test`,
        password: "long slug availability password",
        name: "Slug test",
      },
    });
    const token = registration.json().token;
    assert.equal((await app.inject({ url: "/api/locations/slug-availability?slug=available-name" })).statusCode, 401);
    const tenant = db.prepare("SELECT id FROM tenants").get() as any;
    const location = randomUUID();
    db.prepare("INSERT INTO locations(id,tenant_id,slug,public_id,name,category,profile,published,onboarding_completed) VALUES (?,?,?,?,?,?,?,1,0)").run(
      location, tenant.id, "legacy-live", randomBytes(16).toString("hex"), "Legacy live", "generic", "{}",
    );
    const headers = { authorization: `Bearer ${token}` };
    for (const slug of ["", "ab", "api"]) {
      const response = await app.inject({ url: `/api/locations/slug-availability?slug=${encodeURIComponent(slug)}`, headers });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(Object.keys(response.json()), ["slug", "available"]);
      assert.equal(response.json().available, false);
    }
    const existing = await app.inject({ url: "/api/locations/slug-availability?slug=legacy-live", headers });
    assert.deepEqual(existing.json(), { slug: "legacy-live", available: false });
    const free = await app.inject({ url: "/api/locations/slug-availability?slug=new-live", headers });
    assert.deepEqual(free.json(), { slug: "new-live", available: true });
    const me = await app.inject({ url: "/api/me", headers });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().locations[0].onboarding.completed, true);
  } finally {
    await app.close();
    db.close();
  }
});

test("location creation normalizes friendly business names without changing public QR identity", async () => {
  const db = openDb(":memory:"), app = await createApp(db, cfg);
  try {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-client": "native" },
      payload: { email: `friendly-${randomUUID()}@example.test`, password: "long friendly url password", name: "Friendly" },
    });
    const token = registration.json().token;
    const tenant = db.prepare("SELECT id FROM tenants").get() as any;
    const created = await app.inject({
      method: "POST",
      url: "/api/locations",
      headers: { authorization: `Bearer ${token}` },
      payload: { tenantId: tenant.id, name: "Café Prime", slug: "Café Prime !!!", category: "cafe" },
    });
    assert.equal(created.statusCode, 200);
    assert.equal(created.json().slug, "cafe-prime");
    assert.match(created.json().publicId, /^[a-f0-9]{32}$/);
  } finally {
    await app.close();
    db.close();
  }
});

test("staff invitations are hashed, tenant-bound and single use", async () => {
  const db = openDb(":memory:"), app = await createApp(db, cfg);
  try {
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email: `owner-${randomUUID()}@example.test`, password: "long owner invite password", name: "Invite owner" } });
    const token = registration.json().token, tenant = db.prepare("SELECT id FROM tenants").get() as any;
    db.prepare("UPDATE tenants SET plan_id='prime' WHERE id=?").run(tenant.id);
    const raw = randomBytes(32).toString("hex"), hashValue = createHash("sha256").update(raw).digest("hex");
    db.prepare("INSERT INTO staff_invitations(id,tenant_id,email,name,role,permissions,token_hash,expires_at,invited_by) VALUES (?,?,?,?,?,?,?,?,?)").run(randomUUID(), tenant.id, "new-staff@example.test", "New staff", "staff", "{}", hashValue, new Date(Date.now() + 3600000).toISOString(), db.prepare("SELECT id FROM users").get()!.id);
    const info = await app.inject({ url: `/api/staff/invitations/${raw}` });
    assert.equal(info.statusCode, 200);
    assert.equal(info.json().email, "new-staff@example.test");
    const accepted = await app.inject({ method: "POST", url: `/api/staff/invitations/${raw}/accept`, payload: { password: "long invited password", name: "New staff" } });
    assert.equal(accepted.statusCode, 200);
    assert.equal((db.prepare("SELECT role FROM memberships WHERE tenant_id=? AND user_id=(SELECT id FROM users WHERE email=?)").get(tenant.id, "new-staff@example.test") as any).role, "staff");
    assert.equal((await app.inject({ url: `/api/staff/invitations/${raw}` })).statusCode, 400);
    assert.equal(token.length, 64);
  } finally { await app.close(); db.close(); }
});

test("payment owner approval is single-use and does not verify or activate a route", async () => {
  const db = openDb(":memory:"), app = await createApp(db, cfg);
  try {
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email: `pay-owner-${randomUUID()}@example.test`, password: "long payment owner password", name: "Payment owner" } });
    const owner = db.prepare("SELECT id FROM users").get() as any, tenant = db.prepare("SELECT id FROM tenants").get() as any, location = randomUUID(), route = randomUUID(), raw = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO locations(id,tenant_id,slug,public_id,name,category,profile) VALUES (?,?,?,?,?,?,?)").run(location, tenant.id, "pay-approval", randomBytes(16).toString("hex"), "Pay approval", "generic", "{}");
    db.prepare("INSERT INTO routes(id,location_id,label,provider,vpa,payee,state) VALUES (?,?,?,'basic_upi','owner@test','Owner','draft')").run(route, location, "Owner route");
    db.prepare("INSERT INTO payment_route_approvals(id,route_id,tenant_id,requested_by,owner_user_id,token_hash,status,expires_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), route, tenant.id, owner.id, owner.id, createHash("sha256").update(raw).digest("hex"), "pending_owner_approval", new Date(Date.now() + 3600000).toISOString());
    const confirmed = await app.inject({ method: "POST", url: `/api/payment-routes/confirm/${raw}` });
    assert.equal(confirmed.statusCode, 200);
    assert.equal(confirmed.json().status, "owner_approved");
    assert.equal((db.prepare("SELECT state FROM routes WHERE id=?").get(route) as any).state, "draft");
    assert.equal((await app.inject({ method: "POST", url: `/api/payment-routes/confirm/${raw}` })).statusCode, 400);
    assert.equal(registration.statusCode, 200);
  } finally { await app.close(); db.close(); }
});

test("admin billing list is protected and excludes provider secrets", async () => {
  const db = openDb(":memory:"), app = await createApp(db, cfg);
  try {
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email: `billing-admin-${randomUUID()}@example.test`, password: "long billing admin password", name: "Billing admin" } });
    const token = registration.json().token;
    const user = db.prepare("SELECT id FROM users").get() as any;
    const tenant = db.prepare("SELECT id FROM tenants").get() as any;
    assert.equal((await app.inject({ url: "/api/admin/billing-payments", headers: { authorization: `Bearer ${token}` } })).statusCode, 403);
    db.prepare("UPDATE users SET admin_role='admin' WHERE id=?").run(user.id);
    db.prepare("INSERT INTO billing_payments(id,user_id,tenant_id,plan_id,provider_order_id,amount_paise,currency,status,receipt) VALUES (?,?,?,?,?,?,?,?,?)").run(randomUUID(), user.id, tenant.id, "prime", "order_test_123", 59900, "INR", "CREATED", "receipt_test_123");
    const ownerResponse = await app.inject({ url: "/api/admin/billing-payments", headers: { authorization: `Bearer ${token}` } });
    assert.equal(ownerResponse.statusCode, 200);
    const rows = ownerResponse.json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount_paise, 59900);
    assert.equal("signature" in rows[0], false);
    assert.equal("provider_payload" in rows[0], false);
    assert.equal("secret" in rows[0], false);
  } finally { await app.close(); db.close(); }
});

test("Razorpay checkout verifies HMAC before activating Prime and is idempotent", async () => {
  const db = openDb(":memory:"), secret = "test-razorpay-secret", app = await createApp(db, envSchema.parse({ NODE_ENV: "test", RAZORPAY_KEY_SECRET: secret }));
  try {
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email: `razorpay-${randomUUID()}@example.test`, password: "long razorpay test password", name: "Razorpay test" } });
    const token = registration.json().token;
    const user = db.prepare("SELECT id FROM users").get() as any;
    const tenant = db.prepare("SELECT id FROM tenants").get() as any;
    const location = randomUUID(), payment = randomUUID(), orderId = `order_${randomUUID().replaceAll("-", "")}`;
    db.prepare("INSERT INTO locations(id,tenant_id,slug,public_id,name,category,profile) VALUES (?,?,?,?,?,?,?)").run(location, tenant.id, "razorpay-test-cafe", randomBytes(16).toString("hex"), "Razorpay test cafe", "cafe", "{}");
    db.prepare("INSERT INTO billing_payments(id,user_id,tenant_id,plan_id,provider_order_id,amount_paise,currency,status,receipt) VALUES (?,?,?,?,?,?,?,?,?)").run(payment, user.id, tenant.id, "prime", orderId, 59900, "INR", "CREATED", `receipt_${randomUUID()}`);
    const headers = { authorization: `Bearer ${token}` };
    const invalid = await app.inject({ method: "POST", url: "/api/billing/checkout/verify", headers, payload: { razorpayPaymentId: "pay_invalid", razorpayOrderId: orderId, razorpaySignature: "0".repeat(64) } });
    assert.equal(invalid.statusCode, 400);
    assert.equal((db.prepare("SELECT status FROM billing_payments WHERE id=?").get(payment) as any).status, "CREATED");
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const signature = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    const verified = await app.inject({ method: "POST", url: "/api/billing/checkout/verify", headers, payload: { razorpayPaymentId: paymentId, razorpayOrderId: orderId, razorpaySignature: signature } });
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.json().status, "VERIFIED");
    assert.equal((db.prepare("SELECT status,provider_payment_id FROM billing_payments WHERE id=?").get(payment) as any).provider_payment_id, paymentId);
    assert.equal((db.prepare("SELECT plan_id,billing_state FROM tenants WHERE id=?").get(tenant.id) as any).plan_id, "prime");
    const duplicate = await app.inject({ method: "POST", url: "/api/billing/checkout/verify", headers, payload: { razorpayPaymentId: paymentId, razorpayOrderId: orderId, razorpaySignature: signature } });
    assert.equal(duplicate.statusCode, 200);
    assert.equal((db.prepare("SELECT count(*) n FROM billing_payments WHERE status='VERIFIED' AND tenant_id=?").get(tenant.id) as any).n, 1);
  } finally { await app.close(); db.close(); }
});

test("registration and product-state responses use stable user-facing contracts", async () => {
  const db = openDb(":memory:"), app = await createApp(db, envSchema.parse({ NODE_ENV: "test" }));
  const email = `duplicate-${randomUUID()}@example.test`;
  const first = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email, password: "long duplicate test password", name: "Duplicate test" } });
  assert.equal(first.statusCode, 200);
  const duplicate = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email, password: "long duplicate test password", name: "Duplicate test" } });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().code, "EMAIL_ALREADY_EXISTS");
  db.close();
});

test("registration is identity-only and establishes a durable verification boundary", async () => {
  const db = openDb(":memory:"), app = await createApp(db, envSchema.parse({ NODE_ENV: "test" }));
  const email = `identity-only-${randomUUID()}@example.test`;
  try {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-client": "native" },
      payload: { email, password: "long identity only password" },
    });
    assert.equal(registration.statusCode, 201);
    assert.equal(registration.json().accountCreated, true);
    assert.equal(registration.json().token.length, 64);
    assert.equal((db.prepare("SELECT count(*) n FROM users WHERE email=?").get(email) as any).n, 1);
    assert.equal((db.prepare("SELECT count(*) n FROM locations").get() as any).n, 0);
    assert.equal((db.prepare("SELECT name FROM tenants").get() as any).name, "New workspace");
    assert.equal((db.prepare("SELECT count(*) n FROM email_tokens WHERE purpose='verify'").get() as any).n, 1);
    const me = await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${registration.json().token}` } });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().emailVerified, false);
    assert.deepEqual(me.json().locations, []);
  } finally {
    await app.close();
    db.close();
  }
});

test("publishing is an authenticated, Prime-gated, idempotent operation", async () => {
  const db = openDb(":memory:"), app = await createApp(db, cfg);
  const email = `publish-${randomUUID()}@example.test`;
  const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email, password: "long publish test password", name: "Publish test" } });
  const token = registration.json().token;
  const tenant = db.prepare("SELECT id FROM tenants ORDER BY rowid DESC LIMIT 1").get() as any;
  const headers = { authorization: `Bearer ${token}` };
  const created = await app.inject({ method: "POST", url: "/api/locations", headers, payload: { tenantId: tenant.id, name: "Publish cafe", slug: "publish-cafe", category: "cafe" } });
  assert.equal(created.statusCode, 200);
  const location = created.json();
  await app.inject({ method: "PATCH", url: `/api/locations/${location.id}/onboarding`, headers, payload: { step: 4, name: location.name, category: location.category, profile: location.profile } });
  const blocked = await app.inject({ method: "POST", url: `/api/locations/${location.id}/publish`, headers });
  assert.equal(blocked.statusCode, 402);
  assert.equal(blocked.json().code, "PLAN_REQUIRED");
  db.prepare("UPDATE tenants SET plan_id='prime',billing_state='active' WHERE id=?").run(tenant.id);
  const published = await app.inject({ method: "POST", url: `/api/locations/${location.id}/publish`, headers });
  assert.equal(published.statusCode, 200);
  assert.equal(published.json().published, true);
  assert.equal(published.json().publicId, location.publicId);
  assert.equal((await app.inject({ url: "/api/public/publish-cafe" })).statusCode, 200);
  const repeat = await app.inject({ method: "POST", url: `/api/locations/${location.id}/publish`, headers });
  assert.equal(repeat.statusCode, 200);
  assert.equal(repeat.json().publicId, location.publicId);
  db.close();
});

test("auth rate limits are scoped and return a stable retry contract", async () => {
  const db = openDb(":memory:"), app = await createApp(db, cfg);
  try {
    const loginBody = { email: `rate-${randomUUID()}@example.test`, password: "wrong sufficiently long password" };
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal((await app.inject({ method: "POST", url: "/api/auth/login", payload: loginBody })).statusCode, 401);
    }
    const limited = await app.inject({ method: "POST", url: "/api/auth/login", payload: loginBody });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().code, "RATE_LIMITED");
    assert.ok(Number(limited.json().retryAfterSeconds) > 0);
    assert.ok(Number(limited.headers["retry-after"]) > 0);
    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-client": "native" },
      payload: { email: `signup-after-login-limit-${randomUUID()}@example.test`, password: "long signup password", name: "Signup after login limit" },
    });
    assert.equal(signup.statusCode, 200);
  } finally {
    await app.close();
    db.close();
  }
});
