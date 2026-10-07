import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
import { createPostgresDatabase, resetPostgresPoolForTests } from "../src/async-db.js";
import { PaymentRepository } from "../src/repositories/payment-repository.js";

const connectionString = process.env.POSTGRES_TEST_URL || process.env.DIRECT_URL;

test("PostgreSQL Batch 5 payment routes, attempts, integrity and rollback", { skip: !connectionString }, async () => {
  const rawSqlite = openDb(":memory:");
  const postgres = createPostgresDatabase(connectionString);
  const app = await createApp(
    rawSqlite,
    envSchema.parse({ NODE_ENV: "test", DATABASE_DRIVER: "postgres", DATABASE_URL: connectionString }),
    postgres,
  );
  const call = (method: string, url: string, token?: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({
      method,
      url,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-client": "native", ...extra },
      payload,
    });

  try {
    const owner = await call("POST", "/api/auth/register", undefined, {
      email: `batch5-${Date.now()}@example.test`,
      password: "batch five secure password",
      name: "Payments Kitchen",
    });
    assert.equal(owner.statusCode, 200);
    const ownerToken = owner.json().token;
    const tenantId = (await (await call("GET", "/api/me", ownerToken)).json()).tenants[0].id;
    const locationResponse = await call("POST", "/api/locations", ownerToken, {
      tenantId,
      name: "Payments Kitchen",
      slug: `batch-five-${Date.now()}`,
      category: "restaurant",
    });
    assert.equal(locationResponse.statusCode, 200);
    const location = locationResponse.json();
    const locationView = (await call("GET", `/api/locations/${location.id}`, ownerToken)).json();
    const publish = await call("PUT", `/api/locations/${location.id}`, ownerToken, {
      ...locationView,
      published: true,
      profile: { ...locationView.profile, orderEnabled: true },
    });
    assert.equal(publish.statusCode, 200);

    const item = await call("POST", `/api/locations/${location.id}/items`, ownerToken, {
      name: "Batch Five Burger",
      section: "Menu",
      price_paise: 22000,
      available: true,
    });
    assert.equal(item.statusCode, 200);
    const itemId = item.json().id;

    const routeResponse = await call("POST", `/api/locations/${location.id}/routes`, ownerToken, {
      label: "Test UPI",
      vpa: "restaurant@upi",
      payee: "Payments Kitchen",
    });
    assert.equal(routeResponse.statusCode, 200);
    const routeId = routeResponse.json().id;
    const routes = await call("GET", `/api/locations/${location.id}/routes`, ownerToken);
    assert.equal(routes.statusCode, 200);
    assert.equal(routes.json().routes[0].vpa, "restaurant@upi");
    await postgres.run("UPDATE routes SET state='active',verified_at=CURRENT_TIMESTAMP WHERE id=?", [routeId]);
    await postgres.run("UPDATE locations SET active_route_id=? WHERE id=?", [routeId, location.id]);

    const general = await call("POST", `/api/public/${location.slug}/payments`, undefined, {
      idempotencyKey: randomUUID(),
      amountPaise: 10000,
    });
    assert.equal(general.statusCode, 200);
    assert.equal(general.json().state, "confirmation_pending");
    assert.notEqual(general.json().state, "verified");
    const generalUrl = new URL(general.json().snapshot.uri);
    assert.equal(generalUrl.searchParams.get("pa"), "restaurant@upi");
    assert.equal(generalUrl.searchParams.get("pn"), "Payments Kitchen");
    assert.equal(generalUrl.searchParams.get("am"), "100.00");
    assert.equal(generalUrl.searchParams.get("cu"), "INR");

    const orderResponse = await call("POST", `/api/public/${location.slug}/orders`, undefined, {
      idempotencyKey: randomUUID(),
      lines: [{ itemId, quantity: 1 }],
      orderType: "takeaway",
      paymentMethod: "upi",
    });
    assert.equal(orderResponse.statusCode, 200);
    const order = orderResponse.json();
    const orderPayment = await call("POST", `/api/orders/${order.id}/payments`, undefined, {
      idempotencyKey: randomUUID(),
      amountPaise: 1,
    }, { "x-order-token": order.accessToken });
    assert.equal(orderPayment.statusCode, 200);
    assert.equal(orderPayment.json().snapshot.amountPaise, order.amount_paise);
    assert.notEqual(orderPayment.json().snapshot.amountPaise, 1);

    const retryKey = randomUUID();
    const retries = await Promise.all(Array.from({ length: 2 }, () => call("POST", `/api/public/${location.slug}/payments`, undefined, { idempotencyKey: retryKey, amountPaise: 5000 })));
    assert.equal(retries[0].statusCode, 200);
    assert.equal(retries[1].statusCode, 200);
    assert.equal(retries[0].json().id, retries[1].json().id);
    const count = await postgres.get<any>("SELECT count(*) n FROM attempts WHERE location_id=? AND idempotency_key=?", [location.id, retryKey]);
    assert.equal(Number(count?.n), 1);

    const before = await postgres.get<any>("SELECT count(*) n FROM attempts WHERE location_id=?", [location.id]);
    await assert.rejects(postgres.transaction(async (tx) => {
      await tx.run("INSERT INTO attempts(id,location_id,idempotency_key,route_id,snapshot,amount_paise) VALUES (?,?,?,?,?,?)", [randomUUID(), location.id, randomUUID(), routeId, "{}", 1]);
      throw new Error("forced payment rollback");
    }));
    const after = await postgres.get<any>("SELECT count(*) n FROM attempts WHERE location_id=?", [location.id]);
    assert.equal(Number(after?.n), Number(before?.n));

    const other = new PaymentRepository(postgres);
    await assert.rejects(
      other.createAttempt({ locationId: randomUUID(), activeRouteId: routeId, idempotencyKey: randomUUID(), orderId: order.id }),
      (error: any) => error.statusCode === 403,
    );
  } finally {
    await app.close();
    rawSqlite.close();
    await postgres.close();
    resetPostgresPoolForTests();
  }
});
