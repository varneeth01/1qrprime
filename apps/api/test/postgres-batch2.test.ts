import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
import { createPostgresDatabase, resetPostgresPoolForTests } from "../src/async-db.js";
import { MenuRepository } from "../src/repositories/menu-repository.js";

const connectionString = process.env.POSTGRES_TEST_URL || process.env.DIRECT_URL;

test("PostgreSQL Batch 2 menu, modifiers, tables and tenant isolation", { skip: !connectionString }, async () => {
  const rawSqlite = openDb(":memory:");
  const postgres = createPostgresDatabase(connectionString);
  const app = await createApp(rawSqlite, envSchema.parse({ NODE_ENV: "test", DATABASE_DRIVER: "postgres", DATABASE_URL: connectionString }), postgres);
  const call = (method: string, url: string, token?: string, payload?: unknown) =>
    app.inject({ method, url, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-client": "native" }, payload });

  try {
    const registered = await call("POST", "/api/auth/register", undefined, {
      email: `batch2-${Date.now()}@example.test`,
      password: "batch two secure password",
      name: "Menu Owner",
    });
    assert.equal(registered.statusCode, 200);
    const token = registered.json().token;
    const me = await call("GET", "/api/me", token);
    const tenantId = me.json().tenants[0].id;
    const locationResponse = await call("POST", "/api/locations", token, {
      tenantId,
      name: "Batch Two Kitchen",
      slug: `batch-two-${Date.now()}`,
      category: "restaurant",
    });
    assert.equal(locationResponse.statusCode, 200);
    const location = locationResponse.json();

    const category = await call("POST", `/api/locations/${location.id}/menu/categories`, token, { name: "Main Course", displayOrder: 1 });
    assert.equal(category.statusCode, 200);
    const item = await call("POST", `/api/locations/${location.id}/items`, token, {
      name: "Paneer Burger",
      section: "Main Course",
      price_paise: 18000,
      categoryId: category.json().id,
      foodType: "VEG",
      tags: ["featured"],
      featured: true,
    });
    assert.equal(item.statusCode, 200);
    const itemId = item.json().id;
    const variant = await call("POST", `/api/locations/${location.id}/menu/items/${itemId}/variants`, token, { name: "Large", pricePaise: 22000 });
    assert.equal(variant.statusCode, 200);
    const group = await call("POST", `/api/locations/${location.id}/menu/modifier-groups`, token, { itemId, name: "Extra Add-ons", minSelection: 0, maxSelection: 2 });
    assert.equal(group.statusCode, 200);
    const modifier = await call("POST", `/api/locations/${location.id}/menu/modifier-groups/${group.json().id}/modifiers`, token, { name: "Extra Cheese", pricePaise: 2500 });
    assert.equal(modifier.statusCode, 200);

    const menu = await call("GET", `/api/locations/${location.id}/menu`, token);
    assert.equal(menu.statusCode, 200);
    assert.equal(menu.json().items[0].variants[0].name, "Large");
    assert.equal(menu.json().items[0].modifierGroups[0].modifiers[0].name, "Extra Cheese");

    const edited = await call("PUT", `/api/locations/${location.id}/items/${itemId}`, token, {
      name: "Paneer Burger",
      section: "Main Course",
      price_paise: 19500,
      categoryId: category.json().id,
      available: false,
      featured: true,
    });
    assert.equal(edited.statusCode, 200);

    const table = await call("POST", `/api/locations/${location.id}/tables`, token, { name: "Table 2" });
    assert.equal(table.statusCode, 200);
    const tableId = table.json().id;
    const originalToken = table.json().publicToken;
    const renamed = await call("PATCH", `/api/locations/${location.id}/tables/${tableId}`, token, { name: "Window Table", enabled: true });
    assert.equal(renamed.statusCode, 200);
    const tables = await call("GET", `/api/locations/${location.id}/tables`, token);
    const current = tables.json().tables.find((entry: any) => entry.id === tableId);
    assert.equal(current.name, "Window Table");
    assert.equal(current.public_token, originalToken);

    const second = await call("POST", "/api/auth/register", undefined, {
      email: `batch2-second-${Date.now()}@example.test`,
      password: "batch two secure password",
      name: "Other Owner",
    });
    const denied = await call("GET", `/api/locations/${location.id}/tables`, second.json().token);
    assert.equal(denied.statusCode, 403);

    const repository = new MenuRepository(postgres);
    const rollbackItem = randomUUID();
    await assert.rejects(postgres.transaction(async (tx) => {
      await repository.createItem(tx, {
        id: rollbackItem,
        locationId: location.id,
        name: "Rollback Item",
        description: "",
        section: "Main Course",
        price_paise: 100,
        available: true,
        image: null,
        categoryId: null,
        displayOrder: 0,
        discountedPricePaise: null,
        foodType: "OTHER",
        tags: [],
        prepMinutes: 0,
        taxBps: 0,
        stockStatus: "AVAILABLE",
        featured: false,
        bestseller: false,
        spicy: false,
        recommended: false,
      });
      throw new Error("forced menu rollback");
    }));
    assert.equal(await postgres.get("SELECT id FROM items WHERE id=?", [rollbackItem]), undefined);
  } finally {
    await app.close();
    rawSqlite.close();
    await postgres.close();
    resetPostgresPoolForTests();
  }
});
