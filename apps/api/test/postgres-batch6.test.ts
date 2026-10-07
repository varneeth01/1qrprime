import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
import { createPostgresDatabase, resetPostgresPoolForTests } from "../src/async-db.js";
import { NotificationRepository } from "../src/repositories/notification-repository.js";

const connectionString = process.env.POSTGRES_TEST_URL || process.env.DIRECT_URL;

test("PostgreSQL Batch 6 requests, analytics, staff, push and outbox", { skip: !connectionString }, async () => {
  const rawSqlite = openDb(":memory:");
  const postgres = createPostgresDatabase(connectionString);
  const app = await createApp(
    rawSqlite,
    envSchema.parse({ NODE_ENV: "test", DATABASE_DRIVER: "postgres", DATABASE_URL: connectionString }),
    postgres,
  );
  const call = (method: string, url: string, token?: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-client": "native" },
      payload,
    });

  try {
    const owner = await call("POST", "/api/auth/register", undefined, {
      email: `batch6-${Date.now()}@example.test`,
      password: "batch six secure password",
      name: "Operations Kitchen",
    });
    const ownerToken = owner.json().token;
    const ownerMe = (await call("GET", "/api/me", ownerToken)).json();
    const tenantId = ownerMe.tenants[0].id;
    await postgres.run("UPDATE tenants SET plan_id='prime' WHERE id=?", [tenantId]);
    const created = await call("POST", "/api/locations", ownerToken, {
      tenantId,
      name: "Operations Kitchen",
      slug: `batch-six-${Date.now()}`,
      category: "restaurant",
    });
    const location = created.json();
    const current = (await call("GET", `/api/locations/${location.id}`, ownerToken)).json();
    const published = await call("PUT", `/api/locations/${location.id}`, ownerToken, {
      ...current,
      published: true,
      profile: { ...current.profile, requestEnabled: true },
    });
    assert.equal(published.statusCode, 200);

    const request = await call("POST", `/api/public/${location.slug}/requests`, undefined, {
      name: "Asha",
      contact: "+919999999999",
      message: "Please send water",
    });
    assert.equal(request.statusCode, 200);
    const requestId = request.json().id;
    const listed = await call("GET", `/api/locations/${location.id}/requests`, ownerToken);
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json()[0].id, requestId);
    assert.equal((await call("GET", `/api/locations/${randomUUID()}/requests`, ownerToken)).statusCode, 404);
    assert.equal((await call("POST", `/api/locations/${location.id}/requests/${requestId}/close`, ownerToken)).statusCode, 200);
    assert.equal((await call("GET", `/api/locations/${location.id}/requests`, ownerToken)).json()[0].state, "closed");

    for (const kind of ["qr_scan", "menu_click", "pay_click", "review_click"])
      assert.equal((await call("POST", `/api/public/${location.slug}/events`, undefined, { kind })).statusCode, 200);
    const analytics = await call("GET", `/api/locations/${location.id}/analytics`, ownerToken);
    assert.equal(analytics.statusCode, 200);
    assert.equal(analytics.json().filter((event: any) => event.kind === "pay_click")[0].count, 1);
    await Promise.all(Array.from({ length: 10 }, () => call("POST", `/api/public/${location.slug}/events`, undefined, { kind: "qr_scan" })));
    const concurrentAnalytics = await call("GET", `/api/locations/${location.id}/analytics`, ownerToken);
    assert.equal(concurrentAnalytics.json().find((event: any) => event.kind === "qr_scan").count, 11);

    const staffUser = await call("POST", "/api/auth/register", undefined, {
      email: `batch6-staff-${Date.now()}@example.test`,
      password: "batch six staff password",
      name: "Operations Staff",
    });
    // The registration email above is intentionally stable for the lookup below.
    // Use the response-independent query to obtain the newly created account.
    const staffRow = await postgres.get<any>("SELECT id,email FROM users WHERE email LIKE 'batch6-staff-%@example.test' ORDER BY created_at DESC LIMIT 1");
    assert.ok(staffUser.statusCode === 200 && staffRow);
    const addStaff = await call("POST", `/api/tenants/${tenantId}/staff`, ownerToken, { email: staffRow.email, role: "staff" });
    assert.equal(addStaff.statusCode, 200);
    const staffList = await call("GET", `/api/tenants/${tenantId}/staff`, ownerToken);
    assert.ok(staffList.json().some((member: any) => member.id === staffRow.id && member.role === "staff"));
    assert.equal((await call("GET", `/api/tenants/${randomUUID()}/staff`, ownerToken)).statusCode, 403);
    assert.equal((await call("DELETE", `/api/tenants/${tenantId}/staff/${staffRow.id}`, ownerToken)).statusCode, 200);

    const pushToken = `ExponentPushToken[batch6_${randomUUID().replaceAll("-", "")}]`;
    assert.equal((await call("POST", "/api/push", ownerToken, { token: pushToken, platform: "android", deviceId: "batch6-device", appVersion: "1.0.0" })).statusCode, 200);
    assert.equal((await call("POST", "/api/push", ownerToken, { token: pushToken, platform: "android", deviceId: "batch6-device", appVersion: "1.0.1" })).statusCode, 200);
    assert.equal(Number((await postgres.get<any>("SELECT count(*) n FROM push_tokens WHERE token=?", [pushToken]))?.n), 1);
    assert.equal((await call("DELETE", "/api/push", ownerToken)).statusCode, 200);

    const notifications = new NotificationRepository(postgres);
    const outboxId = randomUUID();
    await notifications.create(postgres, { id: outboxId, locationId: location.id, title: "Test", body: "Test notification" });
    assert.equal((await notifications.pending()).some((entry: any) => entry.id === outboxId), true);
    await notifications.markFailed(postgres, outboxId);
    assert.equal(Number((await postgres.get<any>("SELECT tries FROM outbox WHERE id=?", [outboxId]))?.tries), 1);
    await notifications.markDelivered(postgres, outboxId);
    assert.equal((await notifications.pending()).some((entry: any) => entry.id === outboxId), false);
  } finally {
    await app.close();
    rawSqlite.close();
    await postgres.close();
    resetPostgresPoolForTests();
  }
});
