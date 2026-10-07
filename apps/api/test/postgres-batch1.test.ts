import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
import { createPostgresDatabase, resetPostgresPoolForTests } from "../src/async-db.js";

const connectionString = process.env.POSTGRES_TEST_URL || process.env.DIRECT_URL;

test("PostgreSQL Batch 1 auth, sessions, businesses and tenant isolation", { skip: !connectionString }, async () => {
  const rawSqlite = openDb(":memory:");
  const postgres = createPostgresDatabase(connectionString);
  const app = await createApp(
    rawSqlite,
    envSchema.parse({
      NODE_ENV: "test",
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: connectionString,
    }),
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
    const rollbackUser = `rollback-${Date.now()}`;
    await assert.rejects(
      postgres.transaction(async (tx) => {
        await tx.run("INSERT INTO users(id,email,password) VALUES (?,?,?)", [rollbackUser, `${rollbackUser}@example.test`, "not-a-password"]);
        throw new Error("forced rollback");
      }),
    );
    assert.equal(await postgres.get("SELECT id FROM users WHERE id=?", [rollbackUser]), undefined);

    const email = `batch1-${Date.now()}@example.test`;
    const registered = await call("POST", "/api/auth/register", undefined, {
      email,
      password: "batch one secure password",
      name: "Batch One Owner",
    });
    assert.equal(registered.statusCode, 200);
    const token = registered.json().token;

    const me = await call("GET", "/api/me", token);
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().tenants.length, 1);

    const tenantId = me.json().tenants[0].id;
    const created = await call("POST", "/api/locations", token, {
      tenantId,
      name: "Postgres Kitchen",
      slug: `postgres-kitchen-${Date.now()}`,
      category: "restaurant",
    });
    assert.equal(created.statusCode, 200);
    const location = created.json();
    assert.match(location.publicId, /^[a-f0-9]{32}$/);

    const published = await call("PUT", `/api/locations/${location.id}`, token, {
      ...location,
      published: true,
      profile: { ...location.profile, orderEnabled: true },
    });
    assert.equal(published.statusCode, 200);
    const resumed = await call("PATCH", `/api/locations/${location.id}/onboarding`, token, {
      step: 2,
      completed: true,
    });
    assert.equal(resumed.statusCode, 200);
    const lookup = await call("GET", `/api/locations/${location.id}`, token);
    assert.equal(lookup.statusCode, 200);
    assert.equal(lookup.json().publicId, location.publicId);

    const listed = await call("GET", "/api/me", token);
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().locations[0].publicId, location.publicId);

    const second = await call("POST", "/api/auth/register", undefined, {
      email: `batch1-second-${Date.now()}@example.test`,
      password: "batch one secure password",
      name: "Second Owner",
    });
    assert.equal(second.statusCode, 200);
    const denied = await call("GET", `/api/locations/${location.id}`, second.json().token);
    assert.equal(denied.statusCode, 403);

    const logout = await call("POST", "/api/auth/logout", token);
    assert.equal(logout.statusCode, 200);
    const afterLogout = await call("GET", "/api/me", token);
    assert.equal(afterLogout.statusCode, 401);
  } finally {
    await app.close();
    rawSqlite.close();
    await postgres.close();
    resetPostgresPoolForTests();
  }
});
