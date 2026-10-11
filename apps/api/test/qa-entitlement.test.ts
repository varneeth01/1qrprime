import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";

test("production grants access only to an explicitly marked internal QA account", async () => {
  const db = openDb(":memory:");
  const app = await createApp(db, envSchema.parse({
    NODE_ENV: "production",
    DATABASE_DRIVER: "sqlite",
    PUBLIC_ORIGIN: "https://1qrprime.com",
    API_PUBLIC_ORIGIN: "https://api.1qrprime.com",
    ADMIN_ORIGIN: "https://admin.1qrprime.com",
    DATABASE_URL: "https://db.example.test/pool",
    SUPPORT_EMAIL: "support@example.test",
    SESSION_SECRET: "production-test-session-secret-0123456789012345",
    MEDIA_ROOT: "/tmp/1qr-qa-media",
  }));
  try {
    const email = `qa-production-${randomUUID()}@example.test`;
    const password = "long production test password";
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "x-client": "native" }, payload: { email, password, name: "QA production guard", accountType: "internal_qa" } });
    assert.equal(registration.statusCode, 200);
    const user = db.prepare("SELECT id FROM users WHERE email=?").get(email) as { id: string };
    assert.equal((db.prepare("SELECT account_type FROM users WHERE id=?").get(user.id) as any).account_type, "standard");
    const tenant = db.prepare("SELECT tenant_id FROM memberships WHERE user_id=?").get(user.id) as { tenant_id: string };
    db.prepare("UPDATE users SET email_verified=1 WHERE id=?").run(user.id);
    db.prepare("UPDATE tenants SET plan_id='prime',billing_state='active',billing_source='internal_qa' WHERE id=?").run(tenant.tenant_id);
    db.prepare("INSERT INTO locations(id,tenant_id,slug,public_id,name,category,profile,published,status,onboarding_step,onboarding_completed) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), tenant.tenant_id, `qa-production-${randomUUID().slice(0, 8)}`, randomUUID().replaceAll("-", ""), "QA production guard", "restaurant", "{}", 1, "ACTIVE", 6, 1);
    const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "x-client": "native" }, payload: { email, password } });
    assert.equal(login.statusCode, 200);
    const me = await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${login.json().token}` } });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().internalQa, false);
    assert.equal(me.json().tenants[0].billing_state, "free");
    assert.equal(me.json().tenants[0].billing_source, "internal_qa");

    db.prepare("UPDATE users SET account_type='internal_qa' WHERE id=?").run(user.id);
    const marked = await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${login.json().token}` } });
    assert.equal(marked.statusCode, 200);
    assert.equal(marked.json().internalQa, true);
    assert.equal(marked.json().tenants[0].billing_state, "active");

    db.prepare("UPDATE users SET account_type='standard' WHERE id=?").run(user.id);
    db.prepare("UPDATE tenants SET billing_source='internal_qa',billing_state='active' WHERE id=?").run(tenant.tenant_id);
    const unauthorized = await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${login.json().token}` } });
    assert.equal(unauthorized.json().tenants[0].billing_state, "free");
  } finally {
    await app.close();
    db.close();
  }
});
