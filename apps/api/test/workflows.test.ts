import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { envSchema } from "../src/config.js";
import { safeLink, basicUpi } from "../src/domain.js";
import sharp from "sharp";
const db = openDb(":memory:");
const app = await createApp(db, envSchema.parse({ NODE_ENV: "test" }));
let owner: string,
  other: string,
  admin: string,
  staff: string,
  tenant: string,
  lid: string,
  slug = "test-cafe",
  item: string,
  route: string,
  backup: string,
  order: any;
const call = async (
  method: any,
  path: string,
  token?: string,
  body?: any,
  headers: any = {},
) => {
  const r = await app.inject({
    method,
    url: "/api" + path,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-client": "native",
      ...headers,
    },
    payload: body,
  });
  return {
    status: r.statusCode,
    body: r.headers["content-type"]?.includes("json") ? r.json() : r.body,
    raw: r.rawPayload,
    headers: r.headers,
  };
};
async function signup(email: string) {
  const r = await call("POST", "/auth/register", undefined, {
    email,
    password: "long secure test password",
    name: "Test Merchant",
  });
  assert.equal(r.status, 200);
  return r.body.token;
}
before(async () => {
  owner = await signup("owner@example.test");
  other = await signup("other@example.test");
  admin = await signup("admin@example.test");
  staff = await signup("staff@example.test");
  db.prepare(
    "UPDATE users SET admin_role='admin' WHERE email='admin@example.test'",
  ).run();
  tenant = (await call("GET", "/me", owner)).body.tenants[0].id;
});
after(async () => {
  await app.close();
  db.close();
});
test("authentication expires and rejects invalid credentials", async () => {
  assert.equal((await call("GET", "/me")).status, 401);
  assert.equal(
    (
      await call("POST", "/auth/login", undefined, {
        email: "owner@example.test",
        password: "wrong long password",
      })
    ).status,
    401,
  );
  const token = await signup("expire@example.test");
  const uid = (await call("GET", "/me", token)).body.id;
  db.prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?").run(uid);
  assert.equal((await call("GET", "/me", token)).status, 401);
});
test("category templates and stable location creation", async () => {
  const t = await call("GET", "/templates");
  assert.equal(Object.keys(t.body).length, 9);
  assert.equal(t.body.clinic.requestEnabled, true);
  const r = await call("POST", "/locations", owner, {
    tenantId: tenant,
    name: "Test Café",
    slug,
    category: "restaurant",
  });
  assert.equal(r.status, 200);
  lid = r.body.id;
  assert.equal(r.body.profile.orderEnabled, true);
  assert.equal(
    (
      await call("POST", "/locations", other, {
        tenantId: tenant,
        name: "Bad",
        slug: "other-slug",
        category: "generic",
      })
    ).status,
    403,
  );
});
test("unsafe links rejected and draft page private", async () => {
  assert.equal((await call("GET", `/public/${slug}`)).status, 404);
  const l = (await call("GET", `/locations/${lid}`, owner)).body;
  const bad = await call("PUT", `/locations/${lid}`, owner, {
    ...l,
    published: true,
    profile: {
      ...l.profile,
      actions: [{ label: "Bad", url: "javascript:alert(1)" }],
    },
  });
  assert.equal(bad.status, 400);
  for (const url of [
    "javascript:alert(1)",
    "http://a.com",
    "https://127.0.0.1",
    "https://user:password@a.com",
    "data:text/html,hi",
    "https://localhost",
  ])
    assert.equal(safeLink(url), false);
  assert.equal(safeLink("https://example.com/menu"), true);
  assert.equal(safeLink("tel:+919876543210"), true);
});
test("profile publishing, conflict detection and immutable URL", async () => {
  const l = (await call("GET", `/locations/${lid}`, owner)).body;
  assert.match(l.publicId, /^[a-f0-9]{32}$/);
  const originalPublicId = l.publicId;
  const body = {
    ...l,
    published: true,
    profile: {
      ...l.profile,
      description: "Fresh meals",
      actions: [{ label: "Website", url: "https://example.com" }],
      googleReviewUrl: "https://example.com/review",
      instagramUrl: "https://instagram.com/example",
      whatsappNumber: "+919876543210",
    },
  };
  assert.equal(
    (await call("PUT", `/locations/${lid}`, owner, body)).status,
    200,
  );
  assert.equal(
    (await call("PUT", `/locations/${lid}`, owner, body)).status,
    409,
  );
  const pub = await call("GET", `/public/${slug}`);
  assert.equal(pub.body.profile.description, "Fresh meals");
  assert.equal(pub.body.slug, slug);
  assert.equal(pub.body.publicId, originalPublicId);
  assert.equal(pub.body.profile.googleReviewUrl, "https://example.com/review");
  assert.equal(pub.body.profile.instagramUrl, "https://instagram.com/example");
  const svg = await call("GET", `/locations/${lid}/qr?format=svg`, owner);
  assert.equal(svg.status, 200);
  assert.match(svg.body, /<svg/);
  const png = await call("GET", `/locations/${lid}/qr?format=png`, owner);
  assert.equal(png.headers["content-type"], "image/png");
  assert.ok(String(png.body).length > 100);
  const publicPng = await call("GET", `/public/${slug}/qr?format=png`);
  assert.equal(publicPng.status, 200);
  const pngBytes = Buffer.from(publicPng.raw);
  const stats = await sharp(pngBytes).stats();
  assert.ok(stats.isOpaque, "QR must be opaque");
  assert.ok(stats.channels[0].mean < 250, "QR must contain dark modules");
  assert.ok(stats.channels[0].mean > 5, "QR must preserve a light background");
  assert.equal((await call("POST", `/public/${slug}/events`, undefined, { kind: "landing_view" })).status, 200);
  assert.equal((await call("POST", `/public/${slug}/events`, undefined, { kind: "social_click" })).status, 200);
  assert.equal((await call("POST", `/public/${slug}/events`, undefined, { kind: "unsafe_event" })).status, 400);
});
test("all merchant resource groups are tenant isolated", async () => {
  for (const path of [
    "",
    "/orders",
    "/routes",
    "/analytics",
    "/requests",
    "/audit",
    "/qr",
  ])
    assert.equal(
      (await call("GET", `/locations/${lid}${path}`, other)).status,
      403,
      path,
    );
  assert.equal(
    (await call("GET", `/tenants/${tenant}/staff`, other)).status,
    403,
  );
  assert.equal((await call("GET", "/admin/accounts", owner)).status, 403);
  assert.equal((await call("GET", "/admin/accounts")).status, 401);
});
test("menu items created and unavailable items cannot be ordered", async () => {
  const r = await call("POST", `/locations/${lid}/items`, owner, {
    name: "Filter coffee",
    section: "Drinks",
    price_paise: 8000,
    available: false,
  });
  assert.equal(r.status, 200);
  item = r.body.id;
  const body = {
    idempotencyKey: randomUUID(),
    lines: [{ itemId: item, quantity: 2 }],
    orderType: "takeaway",
    paymentMethod: "counter",
  };
  assert.equal(
    (await call("POST", `/public/${slug}/orders`, undefined, body)).status,
    409,
  );
  assert.equal(
    (
      await call("PUT", `/locations/${lid}/items/${item}`, owner, {
        name: "Filter coffee",
        section: "Drinks",
        price_paise: 8000,
        available: true,
      })
    ).status,
    200,
  );
});
test("order idempotency, immutable pricing and recovery token", async () => {
  const body = {
    idempotencyKey: randomUUID(),
    lines: [{ itemId: item, quantity: 2 }],
    orderType: "takeaway",
    paymentMethod: "counter",
  };
  const r = await call("POST", `/public/${slug}/orders`, undefined, body);
  assert.equal(r.status, 200);
  order = r.body;
  assert.equal(order.amount_paise, 16000);
  assert.equal(
    (await call("POST", `/public/${slug}/orders`, undefined, body)).body.id,
    order.id,
  );
  assert.equal(
    (
      await call("POST", `/public/${slug}/orders`, undefined, {
        ...body,
        lines: [{ itemId: item, quantity: 3 }],
      })
    ).status,
    409,
  );
  assert.equal(db.prepare("SELECT count(*) n FROM orders").get()!.n, 1);
  assert.equal((await call("GET", `/orders/${order.id}`)).status, 404);
  assert.equal(
    (
      await call("GET", `/orders/${order.id}`, undefined, undefined, {
        "x-order-token": order.accessToken,
      })
    ).body.id,
    order.id,
  );
});
test("cross-location items and duplicate lines blocked", async () => {
  const t = (await call("GET", "/me", other)).body.tenants[0].id;
  const l = (
    await call("POST", "/locations", other, {
      tenantId: t,
      name: "Other",
      slug: "other",
      category: "restaurant",
    })
  ).body;
  await call("PUT", `/locations/${l.id}`, other, { ...l, published: true });
  assert.equal(
    (
      await call("POST", "/public/other/orders", undefined, {
        idempotencyKey: randomUUID(),
        lines: [{ itemId: item, quantity: 1 }],
        orderType: "takeaway",
        paymentMethod: "counter",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("POST", `/public/${slug}/orders`, undefined, {
        idempotencyKey: randomUUID(),
        lines: [
          { itemId: item, quantity: 1 },
          { itemId: item, quantity: 2 },
        ],
        orderType: "takeaway",
        paymentMethod: "counter",
      })
    ).status,
    400,
  );
});
test("route activation blocked until independent approval", async () => {
  const r = await call("POST", `/locations/${lid}/routes`, owner, {
    label: "Primary",
    vpa: "merchant@bank",
    payee: "Merchant Café",
  });
  route = r.body.id;
  assert.equal(
    (
      await call(
        "POST",
        `/locations/${lid}/routes/${route}/activate`,
        owner,
        {},
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "POST",
        `/locations/${lid}/routes/${route}/request-verification`,
        owner,
        { evidence: "Merchant ownership reference 1234" },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call("POST", `/admin/routes/${route}/verify`, owner, {
        evidence: "Do not trust merchant self verification",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("POST", `/admin/routes/${route}/verify`, admin, {
        evidence:
          "TEST ONLY independent evidence reference ABC123; not production verification",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "POST",
        `/locations/${lid}/routes/${route}/activate`,
        owner,
        {},
      )
    ).status,
    200,
  );
});
test("route failover preserves existing attempt and rollback audited", async () => {
  const key = randomUUID();
  const old = await call(
    "POST",
    `/orders/${order.id}/payments`,
    undefined,
    { idempotencyKey: key },
    { "x-order-token": order.accessToken },
  );
  assert.equal(old.status, 200);
  assert.equal(old.body.state, "confirmation_pending");
  assert.equal(old.body.snapshot.amountPaise, 16000);
  const r = await call("POST", `/locations/${lid}/routes`, owner, {
    label: "Backup",
    vpa: "backup@bank",
    payee: "Merchant Café",
  });
  backup = r.body.id;
  await call(
    "POST",
    `/locations/${lid}/routes/${backup}/request-verification`,
    owner,
    { evidence: "Ownership reference backup" },
  );
  await call("POST", `/admin/routes/${backup}/verify`, admin, {
    evidence: "TEST ONLY verified backup evidence reference",
  });
  await call("POST", `/locations/${lid}/routes/${backup}/activate`, owner, {
    reason: "Planned switch",
  });
  const retry = await call(
    "POST",
    `/orders/${order.id}/payments`,
    undefined,
    { idempotencyKey: key },
    { "x-order-token": order.accessToken },
  );
  assert.equal(retry.body.snapshot.routeId, route);
  const fresh = await call(
    "POST",
    `/orders/${order.id}/payments`,
    undefined,
    { idempotencyKey: randomUUID() },
    { "x-order-token": order.accessToken },
  );
  assert.equal(fresh.body.snapshot.routeId, backup);
  assert.equal(
    (await call("POST", `/locations/${lid}/routes/rollback`, owner, {})).status,
    200,
  );
  assert.equal(
    (await call("GET", `/locations/${lid}/routes`, owner)).body.activeId,
    route,
  );
  const audit = (await call("GET", `/locations/${lid}/audit`, owner)).body;
  assert.ok(
    audit.some(
      (a: any) =>
        a.action === "route.activated" &&
        JSON.parse(a.detail).reason === "Manual rollback",
    ),
  );
  assert.throws(() => db.prepare("DELETE FROM audit").run(), /immutable/);
});
test("staff permissions and server plan limits", async () => {
  assert.equal(
    (
      await call("POST", `/tenants/${tenant}/staff`, owner, {
        email: "staff@example.test",
        role: "staff",
      })
    ).status,
    402,
  );
  await call("POST", `/admin/tenants/${tenant}/billing`, admin, {
    planId: "prime",
    state: "active",
    reason: "Test entitlement assignment",
  });
  assert.equal(
    (
      await call("POST", `/tenants/${tenant}/staff`, owner, {
        email: "staff@example.test",
        role: "staff",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("GET", `/locations/${lid}/orders`, staff)).status,
    200,
  );
  assert.equal(
    (await call("GET", `/locations/${lid}/routes`, staff)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "POST",
        `/locations/${lid}/routes/${backup}/activate`,
        staff,
        {},
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("POST", `/tenants/${tenant}/staff`, staff, {
        email: "other@example.test",
        role: "manager",
      })
    ).status,
    403,
  );
});
test("state machine and concurrent update protection", async () => {
  assert.equal(
    (
      await call("POST", `/locations/${lid}/orders/${order.id}/state`, other, {
        state: "accepted",
        expectedState: "submitted",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("POST", `/locations/${lid}/orders/${order.id}/state`, staff, {
        state: "completed",
        expectedState: "submitted",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("POST", `/locations/${lid}/orders/${order.id}/state`, staff, {
        state: "accepted",
        expectedState: "submitted",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("POST", `/locations/${lid}/orders/${order.id}/state`, staff, {
        state: "rejected",
        expectedState: "submitted",
      })
    ).status,
    409,
  );
  for (const [old, next] of [
    ["accepted", "preparing"],
    ["preparing", "ready"],
    ["ready", "completed"],
  ])
    assert.equal(
      (
        await call(
          "POST",
          `/locations/${lid}/orders/${order.id}/state`,
          staff,
          { state: next, expectedState: old },
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await call("GET", `/orders/${order.id}`, undefined, undefined, {
        "x-order-token": order.accessToken,
      })
    ).body.state,
    "completed",
  );
});
test("manual payment confirmation never becomes provider verified", async () => {
  assert.equal(
    (
      await call(
        "POST",
        `/locations/${lid}/orders/${order.id}/confirm-payment`,
        staff,
        { reason: "Observed receipt in bank statement" },
      )
    ).status,
    403,
  );
  const r = await call(
    "POST",
    `/locations/${lid}/orders/${order.id}/confirm-payment`,
    owner,
    { reason: "Cash received at counter, test reference 123" },
  );
  assert.equal(r.body.providerVerified, false);
  assert.equal(r.body.state, "merchant_confirmed");
  assert.equal(
    (await call("GET", `/locations/${lid}/analytics`, owner)).body.some(
      (x: any) => x.kind === "payment_verified",
    ),
    false,
  );
  assert.equal(basicUpi.capabilities.statusQueries, false);
});
test("subscription lapse preserves public QR and existing order desk", async () => {
  await call("POST", `/admin/tenants/${tenant}/billing`, admin, {
    planId: "prime",
    state: "expired",
    reason: "Test subscription expiry",
  });
  assert.equal((await call("GET", `/public/${slug}`)).status, 200);
  assert.equal(
    (await call("GET", `/locations/${lid}/orders`, staff)).status,
    200,
  );
  assert.equal(
    (await call("GET", `/locations/${lid}/analytics`, owner)).status,
    402,
  );
  assert.equal(
    (
      await call("POST", `/locations/${lid}/items`, owner, {
        name: "Tea",
        price_paise: 1000,
      })
    ).status,
    402,
  );
});
test("CSRF origin and input validation", async () => {
  const preflight = await app.inject({
    method: "OPTIONS",
    url: "/api/auth/login",
    headers: {
      origin: "http://localhost:5173",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  assert.equal(preflight.statusCode, 204);
  assert.match(String(preflight.headers["access-control-allow-methods"]), /PATCH/);
  assert.equal(
    (
      await call(
        "POST",
        "/auth/logout",
        owner,
        {},
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("POST", `/public/${slug}/events`, undefined, {
        kind: "payment_verified",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("POST", `/locations/${lid}/routes`, owner, {
        label: "Bad",
        vpa: "bad",
        payee: "Test",
      })
    ).status,
    400,
  );
});
test("request and abuse flow, audited restricted support", async () => {
  const l = (await call("GET", `/locations/${lid}`, owner)).body;
  await call("PUT", `/locations/${lid}`, owner, {
    ...l,
    published: true,
    profile: { ...l.profile, requestEnabled: true },
  });
  assert.equal(
    (
      await call("POST", `/public/${slug}/requests`, undefined, {
        name: "Customer",
        contact: "customer@example.test",
        message: "Please contact me about tomorrow",
      })
    ).body.state,
    "new",
  );
  assert.equal(
    (await call("GET", `/locations/${lid}/requests`, staff)).body.length,
    1,
  );
  assert.equal(
    (
      await call("POST", `/public/${slug}/report`, undefined, {
        message: "Test abuse report example",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("GET", `/admin/tenants/${tenant}`, admin)).body.reports.length,
    1,
  );
});
test("data export and account deletion revoke access", async () => {
  assert.equal(
    (await call("GET", "/account/export", owner)).body.tenants[0].locations[0]
      .id,
    lid,
  );
  assert.equal(
    (
      await call("POST", "/account/delete", owner, {
        password: "bad",
        confirmation: "DELETE",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("POST", "/account/delete", owner, {
        password: "long secure test password",
        confirmation: "DELETE",
      })
    ).status,
    200,
  );
  assert.equal((await call("GET", "/me", owner)).status, 401);
  assert.equal((await call("GET", `/public/${slug}`)).status, 404);
  assert.equal(
    (await call("GET", `/locations/${lid}/orders`, staff)).status,
    404,
  );
});
