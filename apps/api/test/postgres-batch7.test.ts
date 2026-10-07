import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
import { createPostgresDatabase, resetPostgresPoolForTests } from "../src/async-db.js";

const connectionString = process.env.POSTGRES_TEST_URL || process.env.DIRECT_URL;

test("PostgreSQL Batch 7 admin/support authorization, audit and deletion", { skip: !connectionString }, async () => {
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
    const ownerResponse = await call("POST", "/api/auth/register", undefined, { email: `batch7-owner-${Date.now()}@example.test`, password: "batch seven owner password", name: "Batch Seven Owner" });
    const supportResponse = await call("POST", "/api/auth/register", undefined, { email: `batch7-support-${Date.now()}@example.test`, password: "batch seven support password", name: "Batch Seven Support" });
    const adminResponse = await call("POST", "/api/auth/register", undefined, { email: `batch7-admin-${Date.now()}@example.test`, password: "batch seven admin password", name: "Batch Seven Admin" });
    const ownerToken = ownerResponse.json().token;
    const supportToken = supportResponse.json().token;
    const adminToken = adminResponse.json().token;
    const ownerTenant = (await (await call("GET", "/api/me", ownerToken)).json()).tenants[0].id;
    const ownerLocation = (await call("POST", "/api/locations", ownerToken, { tenantId: ownerTenant, name: "Batch Seven Business", slug: `batch-seven-${Date.now()}`, category: "restaurant" })).json();
    assert.equal((await call("PUT", `/api/locations/${ownerLocation.id}`, ownerToken, {
      name: ownerLocation.name,
      category: ownerLocation.category,
      profile: ownerLocation.profile,
      published: true,
      version: ownerLocation.version,
    })).statusCode, 200);
    await postgres.run("UPDATE users SET admin_role='support' WHERE email LIKE 'batch7-support-%@example.test'");
    await postgres.run("UPDATE users SET admin_role='admin' WHERE email LIKE 'batch7-admin-%@example.test'");

    assert.equal((await call("GET", "/api/admin/accounts")).statusCode, 401);
    assert.equal((await call("GET", "/api/admin/accounts", ownerToken)).statusCode, 403);
    assert.equal((await call("GET", "/api/admin/accounts", supportToken)).statusCode, 200);
    assert.equal((await call("GET", "/api/admin/accounts", adminToken)).statusCode, 200);

    assert.equal((await call("PUT", "/api/admin/plans/prime", supportToken, { name: "Prime", price_paise: null, entitlements: { locations: 10, staff: 20, orders: true, analytics: true, modules: true } })).statusCode, 403);
    assert.equal((await call("PUT", "/api/admin/plans/prime", adminToken, { name: "Prime", price_paise: null, entitlements: { locations: 10, staff: 20, orders: true, analytics: true, modules: true } })).statusCode, 200);
    assert.equal((await call("GET", `/api/admin/tenants/${ownerTenant}`, supportToken)).statusCode, 200);
    assert.equal((await call("GET", `/api/locations/${ownerLocation.id}/audit`, ownerToken)).statusCode, 200);
    assert.equal((await call("POST", `/api/admin/tenants/${ownerTenant}/notes`, supportToken, { note: "Support diagnostic note" })).statusCode, 200);
    assert.equal((await call("POST", `/api/admin/tenants/${ownerTenant}/billing`, supportToken, { planId: "prime", state: "active", reason: "Support cannot change billing directly" })).statusCode, 403);
    assert.equal((await call("POST", `/api/admin/tenants/${ownerTenant}/billing`, adminToken, { planId: "prime", state: "active", reason: "Controlled Batch Seven test billing change" })).statusCode, 200);

    const report = await call("POST", `/api/public/${ownerLocation.slug}/report`, undefined, { message: "This is a sufficiently detailed test report" });
    assert.equal(report.statusCode, 200);
    const reportRow = await postgres.get<any>("SELECT id FROM reports ORDER BY created_at DESC LIMIT 1");
    assert.equal((await call("POST", `/api/admin/reports/${reportRow.id}/resolve`, supportToken, { unpublish: false, reason: "Support review completed for this report" })).statusCode, 403);
    assert.equal((await call("POST", `/api/admin/reports/${reportRow.id}/resolve`, adminToken, { unpublish: false, reason: "Admin review completed for this report" })).statusCode, 200);

    const exportResponse = await call("GET", "/api/account/export", ownerToken);
    assert.equal(exportResponse.statusCode, 200);
    assert.equal(JSON.stringify(exportResponse.json()).includes("password"), false);

    const deletionResponse = await call("POST", "/api/auth/register", undefined, { email: `batch7-delete-${Date.now()}@example.test`, password: "batch seven deletion password", name: "Delete Me" });
    const deletionToken = deletionResponse.json().token;
    const deletionUser = (await call("GET", "/api/me", deletionToken)).json().id;
    const deletionResult = await call("POST", "/api/account/delete", deletionToken, { password: "batch seven deletion password", confirmation: "DELETE" });
    assert.equal(deletionResult.statusCode, 200, JSON.stringify(deletionResult.json()));
    assert.equal(await postgres.get<any>("SELECT id FROM users WHERE id=?", [deletionUser]), undefined);
    assert.ok(Number((await postgres.get<any>("SELECT count(*) n FROM audit WHERE action='account.deleted' AND actor_id IS NULL"))?.n) >= 1);
  } finally {
    await app.close();
    rawSqlite.close();
    await postgres.close();
    resetPostgresPoolForTests();
  }
});
