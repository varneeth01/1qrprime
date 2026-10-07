import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
import { createPostgresDatabase, resetPostgresPoolForTests } from "../src/async-db.js";
import { OrderRepository } from "../src/repositories/order-repository.js";

const connectionString = process.env.POSTGRES_TEST_URL || process.env.DIRECT_URL;

test("PostgreSQL Batch 4 orders, snapshots, lifecycle and concurrency", { skip: !connectionString }, async () => {
  const rawSqlite = openDb(":memory:");
  const postgres = createPostgresDatabase(connectionString);
  const app = await createApp(
    rawSqlite,
    envSchema.parse({ NODE_ENV: "test", DATABASE_DRIVER: "postgres", DATABASE_URL: connectionString }),
    postgres,
  );
  const call = (method: string, url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method,
      url,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-client": "native", ...headers },
      payload,
    });

  try {
    const registered = await call("POST", "/api/auth/register", undefined, {
      email: `batch4-${Date.now()}@example.test`,
      password: "batch four secure password",
      name: "Order Owner",
    });
    assert.equal(registered.statusCode, 200);
    const ownerToken = registered.json().token;
    const tenantId = (await call("GET", "/api/me", ownerToken)).json().tenants[0].id;
    const locationResponse = await call("POST", "/api/locations", ownerToken, {
      tenantId,
      name: "Batch Four Kitchen",
      slug: `batch-four-${Date.now()}`,
      category: "restaurant",
    });
    const location = locationResponse.json();
    const published = await call("PUT", `/api/locations/${location.id}`, ownerToken, {
      name: location.name,
      category: location.category,
      profile: location.profile,
      published: true,
      version: location.version,
    });
    assert.equal(published.statusCode, 200);
    const liveLocation = published.json();

    const itemResponse = await call("POST", `/api/locations/${liveLocation.id}/items`, ownerToken, {
      name: "Burger",
      description: "Snapshot test burger",
      section: "Main",
      price_paise: 18000,
      featured: true,
    });
    const itemId = itemResponse.json().id;
    const variantResponse = await call("POST", `/api/locations/${liveLocation.id}/menu/items/${itemId}/variants`, ownerToken, { name: "Large", pricePaise: 20000 });
    const variantId = variantResponse.json().id;
    const groupResponse = await call("POST", `/api/locations/${liveLocation.id}/menu/modifier-groups`, ownerToken, { itemId, name: "Add-ons", minSelection: 1, maxSelection: 1, required: true });
    const modifierResponse = await call("POST", `/api/locations/${liveLocation.id}/menu/modifier-groups/${groupResponse.json().id}/modifiers`, ownerToken, { name: "Extra Cheese", pricePaise: 2000 });
    const modifierId = modifierResponse.json().id;
    const tableResponse = await call("POST", `/api/locations/${liveLocation.id}/tables`, ownerToken, { name: "Table 3" });
    const tableToken = tableResponse.json().publicToken;

    const body = {
      idempotencyKey: randomUUID(),
      lines: [{ itemId, quantity: 1, variantId, modifierIds: [modifierId], pricePaise: 1, customerNote: "No onions" }],
      instructions: "Serve quickly",
      orderType: "takeaway",
      paymentMethod: "counter",
      tableToken,
      customerName: "Asha",
      customerPhone: "+919999999999",
    };
    const created = await call("POST", `/api/public/${liveLocation.public_id}/orders`, undefined, body);
    assert.equal(created.statusCode, 200, created.body);
    const order = created.json();
    assert.equal(order.amount_paise, 22000);
    assert.equal(order.tableName, "Table 3");
    assert.equal(order.lines[0].pricePaise, 22000);
    assert.equal(order.lines[0].variantPricePaise, 20000);
    assert.equal(order.lines[0].modifiers[0].pricePaise, 2000);
    assert.equal(order.publicOrderNumber, "QR-1000");

    const duplicate = await call("POST", `/api/public/${liveLocation.public_id}/orders`, undefined, body);
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().id, order.id);
    assert.equal(Number((await postgres.get<any>("SELECT count(*) n FROM orders WHERE location_id=? AND idempotency_key=?", [liveLocation.id, body.idempotencyKey]))!.n), 1);

    const invalidModifier = await call("POST", `/api/public/${liveLocation.public_id}/orders`, undefined, { ...body, idempotencyKey: randomUUID(), lines: [{ ...body.lines[0], modifierIds: [randomUUID()] }] });
    assert.equal(invalidModifier.statusCode, 409);
    assert.equal((await call("PUT", `/api/locations/${liveLocation.id}/items/${itemId}`, ownerToken, { name: "Burger", section: "Main", price_paise: 18000, available: false })).statusCode, 200);
    const unavailable = await call("POST", `/api/public/${liveLocation.public_id}/orders`, undefined, { ...body, idempotencyKey: randomUUID() });
    assert.equal(unavailable.statusCode, 409);
    assert.equal((await call("PUT", `/api/locations/${liveLocation.id}/items/${itemId}`, ownerToken, { name: "Burger", section: "Main", price_paise: 18000, available: true })).statusCode, 200);

    const tracked = await call("GET", `/api/public/orders/${order.trackingToken}`);
    assert.equal(tracked.statusCode, 200);
    assert.equal(tracked.json().tableName, "Table 3");

    const editedItem = await call("PUT", `/api/locations/${liveLocation.id}/items/${itemId}`, ownerToken, {
      name: "Burger",
      section: "Main",
      price_paise: 22000,
      available: true,
    });
    assert.equal(editedItem.statusCode, 200);
    const editedModifier = await call("PATCH", `/api/locations/${liveLocation.id}/menu/modifiers/${modifierId}`, ownerToken, { name: "Extra Cheese", pricePaise: 3000, available: true });
    assert.equal(editedModifier.statusCode, 200);
    assert.equal((await call("PATCH", `/api/locations/${liveLocation.id}/tables/${tableResponse.json().id}`, ownerToken, { name: "Balcony", enabled: true })).statusCode, 200);
    const historical = await call("GET", `/api/public/orders/${order.trackingToken}`);
    assert.equal(historical.json().amount_paise, 22000);
    assert.equal(historical.json().tableName, "Table 3");
    assert.equal(historical.json().lines[0].pricePaise, 22000);
    assert.equal(historical.json().lines[0].modifiers[0].pricePaise, 2000);

    const list = await call("GET", `/api/locations/${liveLocation.id}/orders`, ownerToken);
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().orders[0].tableName, "Table 3");
    const detail = await call("GET", `/api/orders/${order.id}`, undefined, undefined, { "x-order-token": order.accessToken });
    assert.equal(detail.statusCode, 200);

    for (const [expectedState, state] of [["submitted", "accepted"], ["accepted", "preparing"], ["preparing", "ready"], ["ready", "completed"]] as const) {
      const transition = await call("POST", `/api/locations/${liveLocation.id}/orders/${order.id}/state`, ownerToken, { state, expectedState });
      assert.equal(transition.statusCode, 200);
    }
    const invalid = await call("POST", `/api/locations/${liveLocation.id}/orders/${order.id}/state`, ownerToken, { state: "preparing", expectedState: "completed" });
    assert.equal(invalid.statusCode, 409);
    const events = (await call("GET", `/api/locations/${liveLocation.id}/orders`, ownerToken)).json().orders[0].events;
    assert.deepEqual(events.map((event: any) => event.state), ["submitted", "accepted", "preparing", "ready", "completed"]);

    const otherOwner = await call("POST", "/api/auth/register", undefined, {
      email: `batch4-other-${Date.now()}@example.test`,
      password: "batch four secure password",
      name: "Other Owner",
    });
    const otherToken = otherOwner.json().token;
    const otherTenant = (await call("GET", "/api/me", otherToken)).json().tenants[0].id;
    const otherLocation = await call("POST", "/api/locations", otherToken, { tenantId: otherTenant, name: "Other Kitchen", slug: `batch-four-other-${Date.now()}`, category: "restaurant" });
    const otherTable = await call("POST", `/api/locations/${otherLocation.json().id}/tables`, otherToken, { name: "Other Table" });
    const crossBusiness = await call("POST", `/api/public/${liveLocation.public_id}/orders`, undefined, { ...body, idempotencyKey: randomUUID(), tableToken: otherTable.json().publicToken });
    assert.equal(crossBusiness.statusCode, 400);

    const repository = new OrderRepository(postgres);
    const currentProfile = liveLocation.profile;
    const repositoryInput = {
      location: liveLocation,
      tenantAccount: { entitlements: { orders: true } },
      profile: currentProfile,
      body: { ...body, orderType: "takeaway", tableToken: undefined, idempotencyKey: randomUUID() },
      fingerprint: "batch4-concurrency",
    };
    const sameKey = await Promise.all(Array.from({ length: 2 }, () => repository.create(repositoryInput)));
    assert.equal(new Set(sameKey.map((result) => result.order.id)).size, 1);
    assert.equal(Number((await postgres.get<any>("SELECT count(*) n FROM orders WHERE location_id=? AND idempotency_key=?", [liveLocation.id, repositoryInput.body.idempotencyKey]))!.n), 1);

    const concurrent = await Promise.all(Array.from({ length: 20 }, (_, index) => repository.create({
      ...repositoryInput,
      body: { ...repositoryInput.body, idempotencyKey: randomUUID(), customerName: `Concurrent ${index}` },
      fingerprint: `concurrent-${index}`,
    })));
    assert.equal(new Set(concurrent.map((result) => result.order.public_order_number)).size, 20);

    const before = await postgres.get<any>("SELECT count(*) n FROM orders WHERE location_id=?", [liveLocation.id]);
    const rollbackOrder = randomUUID();
    const rollbackItem = randomUUID();
    await assert.rejects(postgres.transaction(async (tx) => {
      await tx.run("INSERT INTO orders(id,location_id,idempotency_key,request_hash,access_token,state,amount_paise,lines,instructions,order_type,payment_method,public_order_number,customer_tracking_token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [rollbackOrder, liveLocation.id, randomUUID(), "rollback", randomUUID(), "submitted", 1, "[]", "", "takeaway", "counter", "QR-ROLLBACK", randomUUID()]);
      await tx.run("INSERT INTO order_items(id,order_id,menu_item_id,item_name_snapshot,variant_snapshot,variant_price_snapshot,unit_price_snapshot,quantity,line_total,customer_note) VALUES (?,?,?,?,?,?,?,?,?,?)", [rollbackItem, rollbackOrder, itemId, "Rollback", null, null, 1, 1, 1, ""]);
      throw new Error("forced order rollback");
    }));
    const after = await postgres.get<any>("SELECT count(*) n FROM orders WHERE location_id=?", [liveLocation.id]);
    assert.equal(Number(after.n), Number(before.n));
    assert.equal(await postgres.get<any>("SELECT id FROM order_items WHERE id=?", [rollbackItem]), undefined);
  } finally {
    await app.close();
    rawSqlite.close();
    await postgres.close();
    resetPostgresPoolForTests();
  }
});
