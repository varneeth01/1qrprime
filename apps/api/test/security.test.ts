import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
      8,
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
  } finally {
    await app.close();
    db.close();
  }
});
