import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
import { createPostgresDatabase, resetPostgresPoolForTests } from "../src/async-db.js";

const connectionString = process.env.POSTGRES_TEST_URL || process.env.DIRECT_URL;

test("PostgreSQL Batch 3 public customer page, QR context and appearance", { skip: !connectionString }, async () => {
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
    const registered = await call("POST", "/api/auth/register", undefined, {
      email: `batch3-${Date.now()}@example.test`,
      password: "batch three secure password",
      name: "Customer Page Owner",
    });
    assert.equal(registered.statusCode, 200);
    const token = registered.json().token;
    const tenantId = (await call("GET", "/api/me", token)).json().tenants[0].id;
    const locationResponse = await call("POST", "/api/locations", token, {
      tenantId,
      name: "Batch Three Kitchen",
      slug: `batch-three-${Date.now()}`,
      category: "restaurant",
    });
    assert.equal(locationResponse.statusCode, 200);
    let location = locationResponse.json();
    const tableResponse = await call("POST", `/api/locations/${location.id}/tables`, token, { name: "Table 3" });
    assert.equal(tableResponse.statusCode, 200);
    const tableToken = tableResponse.json().publicToken;

    const baseProfile = {
      ...location.profile,
      description: "A public customer hub",
      googleReviewUrl: "https://reviews.example.com/batch-three",
      instagramUrl: "https://instagram.com/batch-three",
      directionsUrl: "https://maps.example.com/batch-three",
      websiteUrl: "https://batch-three.example.com",
      whatsappNumber: "+919876543210",
      appearance: {
        ...location.profile.appearance,
        logoUrl: "https://assets.example.com/logo-a.webp",
        coverUrl: "https://assets.example.com/cover-a.webp",
        themePreset: "midnight",
        actionOrder: ["instagram", "menu", "review", "pay", "directions", "whatsapp", "website", "call"],
        hiddenActions: [],
      },
    };
    const publish = async (profile: any) => {
      const response = await call("PUT", `/api/locations/${location.id}`, token, {
        name: location.name,
        category: location.category,
        profile,
        published: true,
        version: location.version,
      });
      assert.equal(response.statusCode, 200);
      location = response.json();
    };

    await publish(baseProfile);
    let publicPage = await call("GET", `/api/public/${location.public_id}?t=${tableToken}`);
    assert.equal(publicPage.statusCode, 200);
    let publicJson = publicPage.json();
    assert.equal(publicJson.publicId, location.public_id);
    assert.equal(publicJson.table.name, "Table 3");
    assert.deepEqual(publicJson.profile.appearance.actionOrder, baseProfile.appearance.actionOrder);
    assert.equal(publicJson.profile.appearance.coverUrl, baseProfile.appearance.coverUrl);
    assert.equal(publicJson.profile.instagramUrl, baseProfile.instagramUrl);

    const routeId = `route-${Date.now()}`;
    await postgres.run(
      "INSERT INTO routes(id,location_id,label,provider,vpa,payee,state) VALUES (?,?,?,?,? ,?,'active')",
      [routeId, location.id, "Test UPI", "basic_upi", "merchant@upi", location.name],
    );
    await postgres.run("UPDATE locations SET active_route_id=? WHERE id=?", [routeId, location.id]);
    publicPage = await call("GET", `/api/public/${location.public_id}`);
    assert.equal(publicPage.json().paymentAvailable, true);

    const reordered = {
      ...baseProfile,
      appearance: {
        ...baseProfile.appearance,
        actionOrder: ["menu", "pay", "whatsapp", "directions", "review", "instagram", "call", "website"],
      },
    };
    await publish(reordered);
    publicPage = await call("GET", `/api/public/${location.public_id}`);
    publicJson = publicPage.json();
    assert.equal(publicJson.publicId, location.public_id);
    assert.deepEqual(publicJson.profile.appearance.actionOrder, reordered.appearance.actionOrder);

    for (const coverUrl of ["https://assets.example.com/cover-b.webp", null, "https://assets.example.com/cover-c.webp"]) {
      await publish({ ...reordered, appearance: { ...reordered.appearance, coverUrl } });
      publicJson = (await call("GET", `/api/public/${location.public_id}`)).json();
      assert.equal(publicJson.profile.appearance.coverUrl, coverUrl);
    }

    const renamed = await call("PATCH", `/api/locations/${location.id}/tables/${tableResponse.json().id}`, token, { name: "Balcony", enabled: true });
    assert.equal(renamed.statusCode, 200);
    publicJson = (await call("GET", `/api/public/${location.public_id}?t=${tableToken}`)).json();
    assert.equal(publicJson.table.name, "Balcony");
    assert.equal(publicJson.table.publicToken, tableToken);

    const otherOwner = await call("POST", "/api/auth/register", undefined, {
      email: `batch3-other-${Date.now()}@example.test`,
      password: "batch three secure password",
      name: "Other Customer Page Owner",
    });
    const otherToken = otherOwner.json().token;
    const otherTenant = (await call("GET", "/api/me", otherToken)).json().tenants[0].id;
    const otherLocation = await call("POST", "/api/locations", otherToken, {
      tenantId: otherTenant,
      name: "Other Public Cafe",
      slug: `batch-three-other-${Date.now()}`,
      category: "cafe",
    });
    const otherTable = await call("POST", `/api/locations/${otherLocation.json().id}/tables`, otherToken, { name: "Other Table" });
    assert.equal((await call("GET", `/api/public/${location.public_id}?t=${otherTable.json().publicToken}`)).json().table, null);

    const profileBeforeRollback = (await call("GET", `/api/public/${location.public_id}`)).json().profile;
    await assert.rejects(postgres.transaction(async (tx) => {
      await tx.run("UPDATE locations SET profile=? WHERE id=?", [JSON.stringify({ broken: true }), location.id]);
      throw new Error("forced appearance rollback");
    }));
    const profileAfterRollback = (await call("GET", `/api/public/${location.public_id}`)).json().profile;
    assert.deepEqual(profileAfterRollback, profileBeforeRollback);

    const qr = await call("GET", `/api/public/${location.public_id}/qr?t=${tableToken}&format=png`);
    assert.equal(qr.statusCode, 200);
    assert.match(String(qr.headers["content-type"]), /image\/png/);
    assert.ok(qr.rawPayload.length > 1000);
  } finally {
    await app.close();
    rawSqlite.close();
    await postgres.close();
    resetPostgresPoolForTests();
  }
});
