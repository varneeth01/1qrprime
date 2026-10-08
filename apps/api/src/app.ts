import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z, ZodError } from "zod";
import QRCode from "qrcode";
import { sendMail } from "./mail.js";
import { type Db } from "./db.js";
import { createSqliteDatabase, type AsyncDatabase, type DbTransaction } from "./async-db.js";
import { AuthRepository } from "./repositories/auth-repository.js";
import { BusinessRepository } from "./repositories/business-repository.js";
import { MenuRepository } from "./repositories/menu-repository.js";
import { TableRepository } from "./repositories/table-repository.js";
import { CustomerPageRepository } from "./repositories/customer-page-repository.js";
import { OrderRepository } from "./repositories/order-repository.js";
import { PaymentRepository } from "./repositories/payment-repository.js";
import { ServiceRequestRepository } from "./repositories/service-request-repository.js";
import { AnalyticsRepository } from "./repositories/analytics-repository.js";
import { StaffRepository } from "./repositories/staff-repository.js";
import { NotificationRepository } from "./repositories/notification-repository.js";
import { AdminRepository } from "./repositories/admin-repository.js";
import { type Config } from "./config.js";
import {
  basicUpi,
  billingCapabilities,
  categories,
  templates,
  CATEGORY_CAPABILITIES,
  profileSchema,
  appearanceSchema,
  itemSchema,
  link,
} from "./domain.js";
const id = () => randomUUID();
const publicId = () => randomBytes(16).toString("hex");
const secret = () => randomBytes(32).toString("hex");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const fail = (code: number, message: string): never => {
  throw Object.assign(new Error(message), { statusCode: code });
};
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
});
export async function createApp(
  db: Db,
  c: Config,
  asyncDatabase?: AsyncDatabase,
  existingApp?: FastifyInstance,
) {
  const app =
    existingApp ??
    Fastify({
      logger: c.NODE_ENV !== "test",
      bodyLimit: 1048576,
      trustProxy: false,
    });
  const localMediaRoot = resolve(dirname(c.DATABASE_PATH), "uploads");
  if (c.STORAGE_DRIVER === "local") mkdirSync(localMediaRoot, { recursive: true });
  await app.register(cookie);
  const browserOrigins = new Set([c.PUBLIC_ORIGIN, c.ADMIN_ORIGIN]);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || browserOrigins.has(origin)),
    credentials: true,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "https:", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, { max: 150, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  const asyncDb = asyncDatabase ?? createSqliteDatabase(db);
  const authRepository = new AuthRepository(asyncDb);
  const businessRepository = new BusinessRepository(asyncDb);
  const menuRepository = new MenuRepository(asyncDb);
  const tableRepository = new TableRepository(asyncDb);
  const customerPageRepository = new CustomerPageRepository(asyncDb);
  const orderRepository = new OrderRepository(asyncDb);
  const paymentRepository = new PaymentRepository(asyncDb);
  const serviceRequestRepository = new ServiceRequestRepository(asyncDb);
  const analyticsRepository = new AnalyticsRepository(asyncDb);
  const staffRepository = new StaffRepository(asyncDb);
  const notificationRepository = new NotificationRepository(asyncDb);
  const adminRepository = new AdminRepository(asyncDb);
  const auditAsync = (actor: string, tenant: string | null, action: string, record: string, detail: unknown, tx: DbTransaction = asyncDb) =>
    authRepository.audit(tx, actor, tenant, action, record, detail);
  const auth = async (r: FastifyRequest) => {
    return asyncAuth(r);
  };
  const membership = async (
    r: FastifyRequest,
    tenant: string,
    roles = ["owner", "manager", "staff"],
  ) => {
    return asyncMembership(r, tenant, roles);
  };
  const loc = async (r: FastifyRequest, roles = ["owner", "manager", "staff"]) => {
    const l = await businessRepository.getLocation((r.params as any).lid);
    if (!l) fail(404, "Location not found");
    const u = await membership(r, l.tenant_id, roles);
    return { l, u };
  };
  const admin = async (r: FastifyRequest, write = false) => {
    const u = await auth(r);
    if (!u.admin_role || (write && u.admin_role !== "admin"))
      fail(403, "Administrator access required");
    return u;
  };
  const ent = async (tenant: string) => asyncEnt(tenant);
  const paid = async (tenant: string, feature: string) => {
    const t = await ent(tenant);
    if (
      ["expired", "suspended"].includes(t.billing_state) ||
      !t.entitlements[feature]
    )
      fail(402, "This management feature is unavailable on the current plan");
    return t;
  };
  const publicLoc = async (slug: string) => {
    const l = await customerPageRepository.getPublishedBusiness(slug);
    if (!l) fail(404, "Business page unavailable");
    return l;
  };
  const orderAccess = async (r: FastifyRequest) => {
    const o = await orderRepository.getById((r.params as any).oid);
    if (!o || r.headers["x-order-token"] !== o.access_token)
      fail(404, "Order not found");
    return o;
  };
  const view = async (l: any) => ({
    ...l,
    publicId: l.public_id,
    status: l.status || (l.published ? "ACTIVE" : "DRAFT"),
    onboarding: { step: l.onboarding_step || 0, completed: !!l.onboarding_completed },
    profile: profileSchema.parse(typeof l.profile === "string" ? JSON.parse(l.profile) : l.profile),
    ...(await menuRepository.getMenu(l.id)),
  });
  const asyncAuth = async (r: FastifyRequest) => {
    const token = r.headers.authorization?.replace(/^Bearer /, "") || r.cookies.session;
    const u = token ? await authRepository.findUserBySession(hash(token), Date.now()) : undefined;
    if (!u) fail(401, "Sign in required");
    return u;
  };
  const asyncMembership = async (r: FastifyRequest, tenant: string, roles = ["owner", "manager", "staff"]) => {
    const u = await asyncAuth(r);
    const m = await businessRepository.getMembership(u.id, tenant);
    if (!m || !roles.includes(m.role)) fail(403, "Permission denied");
    return { ...u, role: m.role };
  };
  const asyncEnt = async (tenant: string) => {
    const t = await asyncDb.get<any>("SELECT t.*,p.entitlements,p.name plan_name FROM tenants t JOIN plans p ON p.id=t.plan_id WHERE t.id=?", [tenant]);
    if (!t) fail(404, "Business not found");
    return { ...t, entitlements: JSON.parse(t.entitlements) };
  };
  const asyncMenuView = (locationId: string) => menuRepository.getMenu(locationId);
  const asyncView = async (l: any) => ({
    ...l,
    publicId: l.public_id,
    status: l.status || (l.published ? "ACTIVE" : "DRAFT"),
    onboarding: { step: l.onboarding_step || 0, completed: !!l.onboarding_completed },
    profile: profileSchema.parse(typeof l.profile === "string" ? JSON.parse(l.profile) : l.profile),
    ...(await asyncMenuView(l.id)),
  });
  app.addHook("onRequest", async (r) => {
    if (
      ["POST", "PUT", "PATCH"].includes(r.method) &&
      r.headers["content-type"] &&
      !r.headers["content-type"].startsWith("application/json") &&
      !r.headers["content-type"].startsWith("multipart/form-data")
    )
      fail(415, "Use application/json");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(r.method) &&
      r.headers.origin &&
      !browserOrigins.has(r.headers.origin)
    )
      fail(403, "Origin not allowed");
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ error: "Invalid input", details: error.issues });
    const e = error as any;
    const status = e.statusCode || 500;
    if (status >= 500) req.log.error({ err: e }, "Request failed");
    return reply.code(status).send({
      error: status >= 500 ? "Service unavailable; please retry" : e.message,
    });
  });
  app.get("/api/health", async () => ({ ok: (await asyncDb.get<any>("SELECT 1 ok"))?.ok === 1 }));
  app.get("/api/ready", async (_r, reply) => {
    try {
      const dbOk = (await asyncDb.get<any>("SELECT 1 ok"))?.ok === 1;
      if (!dbOk) return reply.code(503).send({ ok: false, database: false });
      return { ok: true, database: true, migrations: true };
    } catch {
      return reply.code(503).send({ ok: false, database: false });
    }
  });
  app.get("/api/runtime-config", async () => ({
    publicOrigin: c.PUBLIC_ORIGIN.replace(/\/$/, ""),
    apiBaseUrl: "/api",
    environment: /\.trycloudflare\.com$/i.test(new URL(c.PUBLIC_ORIGIN).hostname)
      ? "PREVIEW"
      : c.NODE_ENV === "production"
        ? "PRODUCTION"
        : c.NODE_ENV === "staging"
          ? "STAGING"
          : "LOCAL",
    temporaryPreview: /\.trycloudflare\.com$/i.test(new URL(c.PUBLIC_ORIGIN).hostname),
  }));
  app.get("/api/templates", async () => templates);
  const newSession = async (userId: string, r: FastifyRequest, reply: any) => {
    const token = secret();
    await authRepository.createSession(asyncDb, hash(token), userId, Date.now() + 7 * 86400000);
    reply.setCookie("session", token, {
      httpOnly: true,
      secure: c.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 604800,
    });
    return r.headers["x-client"] === "native" ? { token } : {};
  };
  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (r, reply) => {
      const b = credentials
        .extend({ name: z.string().min(2).max(100) })
        .parse(r.body);
      const argon2 = await import("argon2");
      const password = await argon2.hash(b.password);
      const userId = id(),
        tenant = id();
      if (await authRepository.findUserByEmail(b.email))
        fail(409, "Unable to register with these details");
      await asyncDb.transaction(async (tx) => {
        await tx.run("INSERT INTO users(id,email,password) VALUES (?,?,?)", [userId, b.email, password]);
        await tx.run("INSERT INTO tenants(id,name) VALUES (?,?)", [tenant, b.name]);
        await tx.run("INSERT INTO memberships VALUES (?,?,?)", [userId, tenant, "owner"]);
        await authRepository.audit(tx, userId, tenant, "account.created", tenant, {});
      });
      return await newSession(userId, r, reply);
    },
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (r, reply) => {
      const b = credentials.parse(r.body);
      const u = await authRepository.findUserByEmail(b.email);
      const argon2 = await import("argon2");
      if (!u || !(await argon2.verify(u.password, b.password)))
        fail(401, "Invalid email or password");
      return await newSession(u.id, r, reply);
    },
  );
  app.post("/api/auth/logout", async (r, reply) => {
    const token =
      r.headers.authorization?.replace(/^Bearer /, "") || r.cookies.session;
    if (token) await authRepository.revokeSession(hash(token));
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.post(
    "/api/auth/recovery",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (r) => {
      const b = z
        .object({ email: z.email().transform((s) => s.toLowerCase()) })
        .parse(r.body);
      const u = await authRepository.findUserByEmail(b.email);
      if (u) {
        const token = secret();
        await asyncDb.transaction(async (tx) => {
          await authRepository.deleteEmailTokens(tx, u.id, "reset");
          await authRepository.createEmailToken(tx, hash(token), u.id, "reset", Date.now() + 30 * 60000);
        });
        await sendMail(
          u.email,
          "Reset your 1QR Prime password",
          `Open ${c.PUBLIC_ORIGIN}/reset#${token} within 30 minutes. Ignore this if you did not request a reset.`,
        );
      }
      return {
        ok: true,
        message: "If the account exists, recovery instructions have been sent.",
      };
    },
  );
  app.post("/api/auth/reset", async (r) => {
    const b = z
      .object({
        token: z.string().length(64),
        password: z.string().min(12).max(128),
      })
      .parse(r.body);
    const argon2 = await import("argon2");
    const password = await argon2.hash(b.password);
    await asyncDb.transaction(async (tx) => {
      const t = await tx.get<any>("SELECT * FROM email_tokens WHERE token_hash=? AND purpose='reset' AND expires_at>?", [hash(b.token), Date.now()]);
      if (!t) fail(400, "Reset link expired or invalid");
      await authRepository.updatePassword(tx, t.user_id, password);
      await authRepository.revokeUserSessions(t.user_id, tx);
      await authRepository.deleteEmailTokens(tx, t.user_id, "reset");
      await authRepository.audit(tx, t.user_id, null, "password.reset", t.user_id, {});
    });
    return { ok: true };
  });
  app.post(
    "/api/auth/request-verification",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (r) => {
      const u = await asyncAuth(r);
      const token = secret();
      await asyncDb.transaction(async (tx) => {
        await authRepository.deleteEmailTokens(tx, u.id, "verify");
        await authRepository.createEmailToken(tx, hash(token), u.id, "verify", Date.now() + 86400000);
      });
      await sendMail(
        u.email,
        "Verify your 1QR Prime email",
        `Open ${c.PUBLIC_ORIGIN}/verify#${token} within 24 hours to verify your email.`,
      );
      return { ok: true };
    },
  );
  app.post("/api/auth/verify", async (r) => {
    const b = z.object({ token: z.string().length(64) }).parse(r.body);
    await asyncDb.transaction(async (tx) => {
      const t = await tx.get<any>("SELECT * FROM email_tokens WHERE token_hash=? AND purpose='verify' AND expires_at>?", [hash(b.token), Date.now()]);
      if (!t) fail(400, "Verification link expired or invalid");
      await authRepository.markEmailVerified(tx, t.user_id);
      await tx.run("DELETE FROM email_tokens WHERE token_hash=?", [hash(b.token)]);
    });
    return { ok: true };
  });
  app.get("/api/me", async (r) => {
    const u = await asyncAuth(r);
    const [tenants, locations] = await businessRepository.listForUser(u.id);
    return {
      id: u.id,
      email: u.email,
      adminRole: u.admin_role,
      emailVerified: !!u.email_verified,
      tenants: await Promise.all(tenants.map(async (t) => ({ ...t, ...(await asyncEnt(t.id)) }))),
      locations: await Promise.all(locations.map(asyncView)),
      billing: billingCapabilities,
    };
  });
  app.post("/api/locations", async (r) => {
    const b = z
      .object({
        tenantId: z.uuid(),
        name: z.string().min(2).max(100),
        slug: z
          .string()
          .min(3)
          .max(60)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        category: z.enum(categories),
      })
      .parse(r.body);
    const u = await asyncMembership(r, b.tenantId, ["owner"]);
    const t = await asyncEnt(b.tenantId);
    if (
      ["expired", "suspended"].includes(t.billing_state) ||
      (await businessRepository.countLocations(b.tenantId))!.n >=
        t.entitlements.locations
    )
      fail(402, "Location limit reached");
    if (await businessRepository.slugExists(b.slug))
      fail(409, "Choose another URL");
    const lid = id();
    const template = templates[b.category];
    await asyncDb.transaction(async (tx) => {
      await businessRepository.createLocation(tx, {
        id: lid,
        tenantId: b.tenantId,
        slug: b.slug,
        publicId: publicId(),
        name: b.name,
        category: b.category,
        profile: JSON.stringify(profileSchema.parse({ orderEnabled: template.orderEnabled, requestEnabled: template.requestEnabled })),
        status: "DRAFT",
        onboardingStep: 0,
        onboardingCompleted: false,
      });
      await authRepository.audit(tx, u.id, b.tenantId, "location.created", lid, { category: b.category });
    });
    return await asyncView(await businessRepository.getLocation(lid));
  });
  app.put("/api/locations/:lid", async (r) => {
    const l = await businessRepository.getLocation((r.params as any).lid);
    if (!l) fail(404, "Location not found");
    const u = await asyncMembership(r, l.tenant_id, ["owner", "manager"]);
    const b = z
      .object({
        name: z.string().min(2).max(100),
        category: z.enum(categories),
        profile: profileSchema,
        published: z.boolean(),
        version: z.number().int(),
      })
      .parse(r.body);
    await asyncDb.transaction(async (tx) => {
      const changed = await businessRepository.updatePublished(tx, {
        name: b.name,
        category: b.category,
        profile: JSON.stringify(b.profile),
        published: b.published,
        status: b.published ? "ACTIVE" : "DRAFT",
        completed: b.published,
        id: l.id,
        version: b.version,
      });
      if (!changed.rowCount)
        fail(409, "Profile changed elsewhere. Refresh before saving.");
      await authRepository.audit(tx, u.id, l.tenant_id, "profile.updated", l.id, { before: l, after: b });
    });
    return await asyncView(await businessRepository.getLocation(l.id));
  });
  app.patch("/api/locations/:lid/onboarding", async (r) => {
    const l = await businessRepository.getLocation((r.params as any).lid);
    if (!l) fail(404, "Location not found");
    const u = await asyncMembership(r, l.tenant_id, ["owner", "manager"]);
    const b = z.object({
      step: z.number().int().min(0).max(12),
      name: z.string().min(2).max(100).optional(),
      category: z.enum(categories).optional(),
      profile: z.record(z.string(), z.unknown()).optional(),
      completed: z.boolean().default(false),
    }).parse(r.body);
    const mergedProfile = profileSchema.parse({ ...JSON.parse(l.profile), ...(b.profile || {}) });
    await asyncDb.transaction(async (tx) => {
      await businessRepository.saveOnboarding(tx, { id: l.id, name: b.name || null, category: b.category || null, profile: JSON.stringify(mergedProfile), step: b.step, completed: b.completed });
      await authRepository.audit(tx, u.id, l.tenant_id, "onboarding.saved", l.id, { step: b.step, completed: b.completed });
    });
    return await asyncView(await businessRepository.getLocation(l.id));
  });
  app.get("/api/locations/:lid", async (r) => {
    const l = await businessRepository.getLocation((r.params as any).lid);
    if (!l) fail(404, "Location not found");
    await asyncMembership(r, l.tenant_id);
    return asyncView(l);
  });
  app.get("/api/locations/:lid/menu", async (r) => {
    const { l } = await loc(r);
    return menuRepository.getMenu(l.id);
  });
  app.post("/api/locations/:lid/menu/categories", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z.object({
      name: z.string().min(1).max(80), description: z.string().max(400).default(""),
      image: link.nullable().optional(), displayOrder: z.number().int().min(0).default(0),
    }).parse(r.body);
    const cid = id();
    await asyncDb.transaction(async (tx) => {
      await menuRepository.createCategory(tx, { id: cid, locationId: l.id, name: b.name, description: b.description, image: b.image || null, displayOrder: b.displayOrder });
      await auditAsync(u.id, l.tenant_id, "menu.category.created", cid, b, tx);
    });
    return { id: cid, ...b };
  });
  app.patch("/api/locations/:lid/menu/categories/:cid", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z.object({ name: z.string().min(1).max(80), description: z.string().max(400).default(""), image: link.nullable().optional(), displayOrder: z.number().int().min(0).default(0), enabled: z.boolean().default(true), available: z.boolean().default(true) }).parse(r.body);
    const changed = await menuRepository.updateCategory(asyncDb, (r.params as any).cid, l.id, { ...b, image: b.image || null });
    if (!changed.rowCount) fail(404, "Category not found");
    await auditAsync(u.id, l.tenant_id, "menu.category.updated", (r.params as any).cid, b);
    return { ok: true };
  });
  app.delete("/api/locations/:lid/menu/categories/:cid", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const cid = (r.params as any).cid;
    const changed = await menuRepository.archiveCategory(asyncDb, cid, l.id);
    if (!changed.rowCount) fail(404, "Category not found");
    await auditAsync(u.id, l.tenant_id, "menu.category.archived", cid, {});
    return { ok: true };
  });
  app.post("/api/locations/:lid/items", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    await paid(l.tenant_id, "modules");
    const b = itemSchema.parse(r.body);
    const iid = id();
    await asyncDb.transaction(async (tx) => {
      await menuRepository.createItem(tx, { ...b, id: iid, locationId: l.id, image: b.image || null, categoryId: b.categoryId || null, discountedPricePaise: b.discountedPricePaise ?? null });
      await auditAsync(u.id, l.tenant_id, "item.created", iid, b, tx);
    });
    return { id: iid };
  });
  app.put("/api/locations/:lid/items/:iid", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const iid = (r.params as any).iid,
      b = itemSchema.parse(r.body);
    await asyncDb.transaction(async (tx) => {
      const changed = await menuRepository.updateItem(tx, iid, l.id, { ...b, image: b.image || null, categoryId: b.categoryId || null, discountedPricePaise: b.discountedPricePaise ?? null });
      if (!changed.rowCount) fail(404, "Item not found");
      await auditAsync(u.id, l.tenant_id, "item.updated", iid, b, tx);
    });
    return { ok: true };
  });
  app.delete("/api/locations/:lid/items/:iid", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const iid = (r.params as any).iid;
    const changed = await menuRepository.archiveItem(asyncDb, iid, l.id);
    if (!changed.rowCount) fail(404, "Item not found");
    await auditAsync(u.id, l.tenant_id, "item.archived", iid, {});
    return { ok: true };
  });
  app.get("/api/locations/:lid/tables", async (r) => {
    const { l } = await loc(r);
    return { tables: (await tableRepository.list(l.id)).map((t: any) => ({ ...t, enabled: Boolean(t.enabled), url: `${c.PUBLIC_ORIGIN}/q/${l.public_id}?t=${encodeURIComponent(t.public_token)}`, qrUrl: `${c.PUBLIC_ORIGIN}/q/${l.public_id}?t=${encodeURIComponent(t.public_token)}` })) };
  });
  app.post("/api/locations/:lid/tables", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z.object({ name: z.string().min(1).max(80) }).parse(r.body);
    const tid = id(), token = secret();
    await asyncDb.transaction(async (tx) => {
      await tableRepository.create(tx, { id: tid, locationId: l.id, name: b.name, publicToken: token });
      await auditAsync(u.id, l.tenant_id, "restaurant.table.created", tid, b, tx);
    });
    return { id: tid, name: b.name, publicToken: token, url: `${c.PUBLIC_ORIGIN}/q/${l.public_id}?t=${encodeURIComponent(token)}` };
  });
  app.patch("/api/locations/:lid/tables/:tid", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z.object({ name: z.string().min(1).max(80), enabled: z.boolean() }).parse(r.body);
    const changed = await tableRepository.update(asyncDb, (r.params as any).tid, l.id, b);
    if (!changed.rowCount) fail(404, "Table not found");
    await auditAsync(u.id, l.tenant_id, "restaurant.table.updated", (r.params as any).tid, b);
    return { ok: true };
  });
  app.delete("/api/locations/:lid/tables/:tid", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const tid = (r.params as any).tid;
    const changed = await tableRepository.archive(asyncDb, tid, l.id);
    if (!changed.rowCount) fail(404, "Table not found");
    await auditAsync(u.id, l.tenant_id, "restaurant.table.archived", tid, {});
    return { ok: true };
  });
  app.get("/api/locations/:lid/tables/:tid/history", async (r) => {
    const { l } = await loc(r);
    const table = await tableRepository.get((r.params as any).tid, l.id);
    if (!table) fail(404, "Table not found");
    const orders = await Promise.all((await tableRepository.history(l.id, table.id)).map((order: any) => orderRepository.view(order)));
    return { table: { ...table, url: `${c.PUBLIC_ORIGIN}/q/${l.public_id}?t=${encodeURIComponent(table.public_token)}` }, orders, today: orders.filter((o: any) => String(o.created_at).slice(0, 10) === new Date().toISOString().slice(0, 10)) };
  });
  app.post("/api/locations/:lid/menu/items/:iid/variants", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const iid = (r.params as any).iid;
    if (!await menuRepository.itemInLocation(iid, l.id)) fail(404, "Item not found");
    const b = z.object({ name: z.string().min(1).max(80), pricePaise: z.number().int().min(0).max(10000000), displayOrder: z.number().int().min(0).default(0) }).parse(r.body);
    const vid = id();
    await asyncDb.transaction(async (tx) => {
      await menuRepository.createVariant(tx, { id: vid, itemId: iid, ...b });
      await auditAsync(u.id, l.tenant_id, "menu.variant.created", vid, b, tx);
    });
    return { id: vid, ...b };
  });
  app.patch("/api/locations/:lid/menu/variants/:vid", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z.object({ name: z.string().min(1).max(80), pricePaise: z.number().int().min(0).max(10000000), displayOrder: z.number().int().min(0).default(0), available: z.boolean().default(true) }).parse(r.body);
    const changed = await menuRepository.updateVariant(asyncDb, (r.params as any).vid, l.id, b);
    if (!changed.rowCount) fail(404, "Variant not found");
    await auditAsync(u.id, l.tenant_id, "menu.variant.updated", (r.params as any).vid, b);
    return { ok: true };
  });
  app.post("/api/locations/:lid/menu/modifier-groups", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z.object({ name: z.string().min(1).max(80), minSelection: z.number().int().min(0).max(20).default(0), maxSelection: z.number().int().min(1).max(20).default(1), required: z.boolean().default(false), itemId: z.uuid() }).parse(r.body);
    if (b.minSelection > b.maxSelection || !await menuRepository.itemInLocation(b.itemId, l.id)) fail(400, "Invalid modifier group");
    const gid = id();
    await asyncDb.transaction(async (tx) => {
      await menuRepository.createModifierGroup(tx, { id: gid, locationId: l.id, ...b });
      await menuRepository.attachModifierGroup(tx, b.itemId, gid);
      await auditAsync(u.id, l.tenant_id, "menu.modifier_group.created", gid, b, tx);
    });
    return { id: gid, ...b };
  });
  app.post("/api/locations/:lid/menu/modifier-groups/:gid/modifiers", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const gid = (r.params as any).gid;
    if (!await menuRepository.modifierGroupInLocation(gid, l.id)) fail(404, "Modifier group not found");
    const b = z.object({ name: z.string().min(1).max(80), pricePaise: z.number().int().min(0).max(10000000), displayOrder: z.number().int().min(0).default(0) }).parse(r.body);
    const mid = id();
    await asyncDb.transaction(async (tx) => {
      await menuRepository.createModifier(tx, { id: mid, groupId: gid, ...b });
      await auditAsync(u.id, l.tenant_id, "menu.modifier.created", mid, b, tx);
    });
    return { id: mid, ...b };
  });
  app.patch("/api/locations/:lid/menu/modifiers/:mid", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z.object({ name: z.string().min(1).max(80), pricePaise: z.number().int().min(0).max(10000000), displayOrder: z.number().int().min(0).default(0), available: z.boolean().default(true) }).parse(r.body);
    const changed = await menuRepository.updateModifier(asyncDb, (r.params as any).mid, l.id, b);
    if (!changed.rowCount) fail(404, "Modifier not found");
    await auditAsync(u.id, l.tenant_id, "menu.modifier.updated", (r.params as any).mid, b);
    return { ok: true };
  });
  app.get("/api/media/:tenant/:asset", async (r, reply) => {
    if (c.STORAGE_DRIVER !== "local") fail(404, "Media not found");
    const tenant = String((r.params as any).tenant);
    const asset = String((r.params as any).asset);
    if (!/^[a-zA-Z0-9_-]+$/.test(tenant) || !/^[a-zA-Z0-9_-]+\.webp$/.test(asset)) fail(404, "Media not found");
    try {
      return reply.type("image/webp").send(readFileSync(join(localMediaRoot, tenant, asset)));
    } catch {
      fail(404, "Media not found");
    }
  });
  app.post("/api/locations/:lid/upload", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    if (c.STORAGE_DRIVER === "s3" && (!c.S3_BUCKET || !c.S3_PUBLIC_ORIGIN))
      fail(503, "Image storage is not configured");
    if (c.STORAGE_DRIVER === "vercel-blob" && !c.BLOB_READ_WRITE_TOKEN)
      fail(503, "Vercel Blob storage is not configured");
    const f = await r.file();
    if (!f || !["image/jpeg", "image/png", "image/webp"].includes(f.mimetype))
      fail(400, "Use JPEG, PNG or WebP up to 5 MB");
    const raw = await f!.toBuffer();
    const { default: sharp } = await import("sharp");
    const image = await sharp(raw, { limitInputPixels: 25000000 })
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const key = `${l.tenant_id}/${id()}.webp`;
    if (c.STORAGE_DRIVER === "local") {
      const folder = join(localMediaRoot, l.tenant_id);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, key.split("/").at(-1)!), image);
      await auditAsync(u.id, l.tenant_id, "image.uploaded", l.id, { key, driver: "local" });
      return { url: `${c.PUBLIC_ORIGIN}/api/media/${key}` };
    }
    if (c.STORAGE_DRIVER === "vercel-blob") {
      const { put: putBlob } = await import("@vercel/blob");
      const blob = await putBlob(`businesses/${l.id}/media/${id()}.webp`, image, {
        access: "public",
        addRandomSuffix: false,
        token: c.BLOB_READ_WRITE_TOKEN,
        contentType: "image/webp",
      });
      await auditAsync(u.id, l.tenant_id, "image.uploaded", l.id, { key: blob.pathname, driver: "vercel-blob" });
      return { url: blob.url };
    }
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    await new S3Client({
      region: c.AWS_REGION,
      endpoint: c.S3_ENDPOINT,
      forcePathStyle: Boolean(c.S3_ENDPOINT),
      credentials: c.S3_ACCESS_KEY_ID && c.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY }
        : undefined,
    }).send(
      new PutObjectCommand({
        Bucket: c.S3_BUCKET,
        Key: key,
        Body: image,
        ContentType: "image/webp",
      }),
    );
    await auditAsync(u.id, l.tenant_id, "image.uploaded", l.id, { key });
    return { url: `${c.S3_PUBLIC_ORIGIN}/${key}` };
  });
  app.get("/api/locations/:lid/routes", async (r) => {
    const { l } = await loc(r, ["owner", "manager"]);
    return {
      routes: await paymentRepository.listRoutes(l.id),
      activeId: l.active_route_id,
      previousId: l.previous_route_id,
      provider: basicUpi.capabilities,
    };
  });
  app.post("/api/locations/:lid/routes", async (r) => {
    const { l, u } = await loc(r, ["owner"]);
    if (c.NODE_ENV === "production" && !u.email_verified)
      fail(403, "Verify your email before adding payment routes");
    const b = z
      .object({
        label: z.string().min(2).max(60),
        vpa: z.string().regex(/^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/),
        payee: z.string().min(2).max(80),
      })
      .parse(r.body);
    const rid = id();
    await asyncDb.transaction(async (tx) => {
      await paymentRepository.createRoute(tx, { id: rid, locationId: l.id, ...b });
      await auditAsync(u.id, l.tenant_id, "route.created", rid, b, tx);
    });
    return { id: rid };
  });
  app.post(
    "/api/locations/:lid/routes/:rid/request-verification",
    async (r) => {
      const { l, u } = await loc(r, ["owner"]);
      const b = z
        .object({ evidence: z.string().min(10).max(500) })
        .parse(r.body);
      await asyncDb.transaction(async (tx) => {
        if (!(await paymentRepository.requestVerification(tx, (r.params as any).rid, l.id, b.evidence)).rowCount)
          fail(409, "Route must be in draft");
        await auditAsync(
          u.id,
          l.tenant_id,
          "route.verification_requested",
          (r.params as any).rid,
          b,
          tx,
        );
      });
      return { ok: true };
    },
  );
  const activate = async (l: any, u: any, rid: string, reason: string) => {
    const route = await paymentRepository.getActivatableRoute(rid, l.id);
    if (!route) fail(409, "Only verified routes can be activated");
    if (l.active_route_id === rid) return;
    await asyncDb.transaction(async (tx) => {
      await paymentRepository.activate(tx, l.id, l.active_route_id, rid);
      await auditAsync(u.id, l.tenant_id, "route.activated", l.id, {
        old: l.active_route_id,
        new: rid,
        reason,
      }, tx);
      await notificationRepository.create(tx, {
        id: id(),
        locationId: l.id,
        title: "Payment route changed",
        body: `Active destination changed to ${route.label}. Review if unexpected.`,
      });
    });
  };
  app.post("/api/locations/:lid/routes/:rid/activate", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z
      .object({ reason: z.string().max(300).default("") })
      .parse(r.body || {});
    await activate(l, u, (r.params as any).rid, b.reason);
    return { ok: true };
  });
  app.post("/api/locations/:lid/routes/rollback", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    if (!l.previous_route_id) fail(409, "No previous route");
    await activate(l, u, l.previous_route_id, "Manual rollback");
    return { ok: true };
  });
  app.post("/api/locations/:lid/routes/:rid/disable", async (r) => {
    const { l, u } = await loc(r, ["owner"]);
    const rid = (r.params as any).rid;
    if (rid === l.active_route_id)
      fail(409, "Switch the active route before disabling it");
    await asyncDb.transaction(async (tx) => {
      if (!(await paymentRepository.disable(tx, rid, l.id)).rowCount)
        fail(404, "Route not found");
      await auditAsync(u.id, l.tenant_id, "route.disabled", rid, {}, tx);
    });
    return { ok: true };
  });
  app.get("/api/public/:slug", async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const p = profileSchema.parse(JSON.parse(l.profile));
    const token = z.object({ t: z.string().max(80).optional() }).parse(r.query).t;
    const table = token ? await tableRepository.getEnabledByToken(l.id, token) : null;
    return {
      id: l.id,
      publicId: l.public_id,
      name: l.name,
      slug: l.slug,
      category: l.category,
      profile: p,
      capabilities: CATEGORY_CAPABILITIES[l.category as keyof typeof CATEGORY_CAPABILITIES] || CATEGORY_CAPABILITIES.generic,
      ...(await asyncMenuView(l.id)),
      table: table ? { id: table.id, name: table.name, publicToken: table.public_token } : null,
      paymentAvailable: !!l.active_route_id,
    };
  });
  // QR artwork is non-sensitive public artwork. Keeping a public image route
  // lets customer cameras and the native merchant app render the same stable
  // QR without depending on an authenticated Image request/cache.
  app.get("/api/public/:slug/qr", async (r, reply) => {
    const l = await publicLoc((r.params as any).slug);
    const q = z.object({ format: z.enum(["svg", "png"]).default("png"), t: z.string().max(100).optional() }).parse(r.query);
    let payload = `${c.PUBLIC_ORIGIN}/q/${l.public_id}?source=qr`;
    if (q.t) {
      const table = await tableRepository.getEnabledByToken(l.id, q.t);
      if (!table) fail(409, "Table is unavailable");
      payload = `${c.PUBLIC_ORIGIN}/q/${l.public_id}?t=${encodeURIComponent(table.public_token)}&source=table-qr`;
    }
    const options = { errorCorrectionLevel: "H" as const, margin: 4, width: 1200, color: { dark: "#000000", light: "#ffffff" } };
    reply.header("Cache-Control", "no-store");
    return q.format === "svg"
      ? reply.type("image/svg+xml").send(await QRCode.toString(payload, { ...options, type: "svg" }))
      : reply.type("image/png").send(await QRCode.toBuffer(payload, options));
  });
  app.post("/api/public/:slug/events", async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const b = z
      .object({
        kind: z.enum([
          "qr_scan",
          "page_view",
          "action_tap",
          "menu_view",
          "cart_start",
          "item_view",
          "add_to_cart",
          "remove_from_cart",
          "checkout_started",
          "order_placed",
          "payment_click",
          "review_click",
          "landing_view",
          "menu_click",
          "pay_click",
          "call_click",
          "whatsapp_click",
          "directions_click",
          "social_click",
          "website_click",
        ]),
      })
      .parse(r.body);
    await analyticsRepository.record(asyncDb, l.id, b.kind);
    return { ok: true };
  });
  app.get("/api/locations/:lid/qr", async (r, reply) => {
    const { l } = await loc(r);
    const q = z
      .object({
        format: z.enum(["svg", "png"]).default("svg"),
        kind: z.enum(["page", "payment", "table"]).default("page"),
        tableId: z.uuid().optional(),
      })
      .parse(r.query);
    let payload = `${c.PUBLIC_ORIGIN}/q/${l.public_id}?source=qr`;
    if (q.kind === "table") {
      const table = q.tableId && await tableRepository.get(q.tableId, l.id);
      if (!table) fail(409, "Active table not found");
      if (!table.enabled) fail(409, "Active table not found");
      payload = `${c.PUBLIC_ORIGIN}/q/${l.public_id}?t=${encodeURIComponent(table.public_token)}&source=table-qr`;
    }
    if (q.kind === "payment") {
      const route = await customerPageRepository.getActivePaymentRoute(l.id, l.active_route_id);
      if (!route) fail(409, "Activate a verified route first");
      payload = basicUpi.create({
        vpa: route.vpa,
        payee: route.payee,
        reference: `L${l.id.slice(0, 8)}`,
      }).uri;
    }
    const options = {
      errorCorrectionLevel: "H" as const,
      margin: 4,
      width: 1200,
      color: { dark: "#000000", light: "#ffffff" },
    };
    reply.header(
      "Content-Disposition",
      `attachment; filename="1qr-${l.slug}-${q.kind}.${q.format}"`,
    );
    return q.format === "svg"
      ? reply
          .type("image/svg+xml")
          .send(await QRCode.toString(payload, { ...options, type: "svg" }))
      : reply.type("image/png").send(await QRCode.toBuffer(payload, options));
  });
  app.post(
    "/api/public/:slug/orders",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (r) => {
      const l = await publicLoc((r.params as any).slug);
      const b = z
        .object({
          idempotencyKey: z.uuid(),
          lines: z
            .array(
              z.object({
                itemId: z.uuid(),
                quantity: z.number().int().min(1).max(20),
                variantId: z.uuid().optional(),
                modifierIds: z.array(z.uuid()).max(20).default([]),
                customerNote: z.string().max(300).default(""),
              }),
            )
            .min(1)
            .max(50),
          instructions: z.string().max(300).default(""),
          orderType: z.enum(["dine_in", "takeaway", "delivery"]),
          paymentMethod: z.enum(["upi", "counter"]),
          tableId: z.string().max(100).optional(),
          tableToken: z.string().max(100).optional(),
          customerName: z.string().max(100).default(""),
          customerPhone: z.string().max(20).default(""),
          deliveryAddress: z.string().max(500).default(""),
          landmark: z.string().max(200).default(""),
        })
        .parse(r.body);
      const fingerprint = hash(JSON.stringify(b));
      const tenantAccount = await ent(l.tenant_id);
      const created = await orderRepository.create({
        location: l,
        tenantAccount,
        profile: profileSchema.parse(typeof l.profile === "string" ? JSON.parse(l.profile) : l.profile),
        body: b,
        fingerprint,
      });
      return { ...(await orderRepository.view(created.order)), accessToken: created.accessToken };
    },
  );
  app.get("/api/orders/:oid", async (r) => orderRepository.view(await orderAccess(r)));
  app.get("/api/public/orders/:token", async (r) => {
    const o = await orderRepository.getByTrackingToken((r.params as any).token);
    if (!o) fail(404, "Order not found");
    return orderRepository.view(o);
  });
  app.get("/api/locations/:lid/orders", async (r) => {
    const { l } = await loc(r);
    const orderRows = await orderRepository.list(l.id);
    return {
      orders: await Promise.all(orderRows.map(async (o: any) => ({ ...await orderRepository.view(o), events: await orderRepository.events(o.id) }))),
      serverTime: new Date().toISOString(),
      pollAfterMs: 4000,
    };
  });
  app.post("/api/locations/:lid/orders/:oid/state", async (r) => {
    const { l, u } = await loc(r);
    const b = z
      .object({ state: z.string(), expectedState: z.string(), reason: z.string().max(300).default("") })
      .parse(r.body);
    const oid = (r.params as any).oid;
    await asyncDb.transaction(async (tx) => {
      const previous = await orderRepository.transition(tx, oid, l.id, b.state, b.expectedState, u.id, b.reason);
      await auditAsync(u.id, l.tenant_id, "order.state", oid, { old: previous.state, new: b.state }, tx);
    });
    return { ok: true };
  });
  app.post("/api/orders/:oid/payments", async (r) => {
    const o = await orderAccess(r);
    if (
      ["rejected", "cancelled", "completed"].includes(o.state) ||
      o.payment_state !== "pending"
    )
      fail(409, "Order is not payable");
    const b = z.object({ idempotencyKey: z.uuid() }).parse(r.body);
    const location = await businessRepository.getLocation(o.location_id);
    if (!location) fail(404, "Location not found");
    return paymentRepository.createAttempt({
      locationId: location.id,
      activeRouteId: location.active_route_id,
      idempotencyKey: b.idempotencyKey,
      orderId: o.id,
    });
  });
  app.post("/api/public/:slug/payments", async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const b = z.object({ idempotencyKey: z.uuid(), amountPaise: z.number().int().min(1).max(100000000).optional() }).parse(r.body);
    return paymentRepository.createAttempt({
      locationId: l.id,
      activeRouteId: l.active_route_id,
      idempotencyKey: b.idempotencyKey,
      amountPaise: b.amountPaise,
    });
  });
  app.post("/api/locations/:lid/orders/:oid/confirm-payment", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    const b = z.object({ reason: z.string().min(10).max(300) }).parse(r.body);
    const oid = (r.params as any).oid;
    await asyncDb.transaction(async (tx) => {
      if (!(await paymentRepository.confirmOrderPayment(tx, oid, l.id)).rowCount)
        fail(409, "Order unavailable or already confirmed");
      await auditAsync(u.id, l.tenant_id, "payment.merchant_confirmed", oid, b, tx);
    });
    return { ok: true, state: "merchant_confirmed", providerVerified: false };
  });
  app.post("/api/public/:slug/requests", async (r) => {
    const l = await publicLoc((r.params as any).slug);
    if (!JSON.parse(l.profile).requestEnabled)
      fail(409, "Requests unavailable");
    const b = z
      .object({
        name: z.string().min(2).max(80),
        contact: z.string().min(6).max(100),
        message: z.string().min(3).max(300),
      })
      .parse(r.body);
    const rid = id();
    await serviceRequestRepository.create(asyncDb, {
      id: rid,
      locationId: l.id,
      name: b.name,
      contact: b.contact,
      message: b.message,
    });
    return {
      id: rid,
      state: "new",
      message: "Request received; the business must confirm availability.",
    };
  });
  app.get("/api/locations/:lid/requests", async (r) =>
    serviceRequestRepository.list((await loc(r)).l.id),
  );
  app.post("/api/locations/:lid/requests/:rid/close", async (r) => {
    const { l, u } = await loc(r);
    const rid = (r.params as any).rid;
    await asyncDb.transaction(async (tx) => {
      if (!(await serviceRequestRepository.close(tx, rid, l.id)).rowCount)
        fail(404, "Request not found");
      await auditAsync(u.id, l.tenant_id, "request.closed", rid, {}, tx);
    });
    return { ok: true };
  });
  app.get("/api/locations/:lid/analytics", async (r) => {
    const { l } = await loc(r, ["owner", "manager"]);
    await paid(l.tenant_id, "analytics");
    return analyticsRepository.list(l.id);
  });
  app.get("/api/locations/:lid/audit", async (r) => {
    const { l } = await loc(r, ["owner"]);
    return adminRepository.auditList(l.tenant_id);
  });
  app.get("/api/tenants/:tid/staff", async (r) => {
    const tid = (r.params as any).tid;
    await membership(r, tid, ["owner"]);
    return staffRepository.list(tid);
  });
  app.post("/api/tenants/:tid/staff", async (r) => {
    const tid = (r.params as any).tid,
      u = await membership(r, tid, ["owner"]);
    const t = await paid(tid, "staff");
    const b = z
      .object({
        email: z.email().transform((s) => s.toLowerCase()),
        role: z.enum(["manager", "staff"]),
      })
      .parse(r.body);
    const target = await staffRepository.findUserByEmail(b.email);
    if (!target) fail(404, "Staff must register an account first");
    const current = await staffRepository.membership(target.id, tid);
    if (current?.role === "owner")
      fail(409, "Ownership cannot be changed here");
    if (
      !current &&
      Number((await staffRepository.countNonOwners(tid))?.n ?? 0) >= t.entitlements.staff
    )
      fail(402, "Staff limit reached");
    await asyncDb.transaction(async (tx) => {
      await staffRepository.upsert(tx, target.id, tid, b.role);
      await auditAsync(u.id, tid, "staff.updated", target.id, b, tx);
    });
    return { ok: true };
  });
  app.delete("/api/tenants/:tid/staff/:uid", async (r) => {
    const tid = (r.params as any).tid,
      u = await membership(r, tid, ["owner"]);
    const uid = (r.params as any).uid;
    await asyncDb.transaction(async (tx) => {
      if (!(await staffRepository.remove(tx, uid, tid)).rowCount)
        fail(404, "Staff membership not found");
      await auditAsync(u.id, tid, "staff.removed", uid, {}, tx);
    });
    return { ok: true };
  });
  app.post("/api/push", async (r) => {
    const u = await auth(r),
      b = z
        .object({
          token: z
            .string()
            .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
          platform: z.enum(["android", "ios", "expo"]).default("expo"),
          deviceId: z.string().min(8).max(200).optional(),
          appVersion: z.string().max(40).optional(),
        })
        .parse(r.body);
    await asyncDb.run(
      "INSERT INTO push_tokens(token,user_id,platform,device_id,app_version,enabled,last_seen_at) VALUES (?,?,?,?,?,TRUE,CURRENT_TIMESTAMP) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,device_id=excluded.device_id,app_version=excluded.app_version,enabled=TRUE,last_seen_at=CURRENT_TIMESTAMP",
      [b.token, u.id, b.platform, b.deviceId || null, b.appVersion || null],
    );
    return { ok: true };
  });
  app.delete("/api/push", async (r) => {
    const u = await auth(r);
    await asyncDb.run("DELETE FROM push_tokens WHERE user_id=?", [u.id]);
    return { ok: true };
  });
  app.post("/api/public/:slug/report", async (r) => {
    const l = await publicLoc((r.params as any).slug),
      b = z.object({ message: z.string().min(10).max(500) }).parse(r.body);
    await adminRepository.createReport(asyncDb, { id: id(), locationId: l.id, message: b.message });
    return { ok: true };
  });
  app.get("/api/account/export", async (r) => {
    const u = await auth(r);
    const tenants = (await adminRepository.ownedTenantIds(u.id)).map((x) => x.tenant_id);
    const tenantViews = await Promise.all(tenants.map(async (t) => ({
      account: await ent(t),
      locations: await Promise.all((await adminRepository.locationsForTenant(t)).map(async (l) => ({
        ...(await view(l)),
        orders: await Promise.all((await orderRepository.list(l.id)).map((order: any) => orderRepository.view(order))),
        routes: await paymentRepository.listRoutes(l.id),
        requests: await serviceRequestRepository.list(l.id),
      }))),
    })));
    return {
      email: u.email,
      tenants: tenantViews,
    };
  });
  app.post("/api/account/delete", async (r) => {
    const u = await auth(r),
      b = z
        .object({ password: z.string(), confirmation: z.literal("DELETE") })
        .parse(r.body);
    const argon2 = await import("argon2");
    if (!(await argon2.verify(u.password, b.password)))
      fail(401, "Incorrect password");
    await asyncDb.transaction(async (tx) => {
      await adminRepository.deleteAccount(tx, u.id);
    });
    return { ok: true };
  });
  app.get("/api/admin/accounts", async (r) => {
    const u = await admin(r);
    const q = z.object({ q: z.string().max(100).default("") }).parse(r.query);
    await auditAsync(u.id, null, "admin.lookup", "accounts", { query: q.q });
    return adminRepository.accounts(q.q);
  });
  app.get("/api/admin/plans", async (r) => {
    await admin(r);
    return (await adminRepository.plans()).map((p) => ({
      ...p,
      entitlements: JSON.parse(p.entitlements),
    }));
  });
  app.put("/api/admin/plans/:pid", async (r) => {
    const u = await admin(r, true);
    const b = z
      .object({
        name: z.string().min(2).max(40),
        price_paise: z.number().int().nonnegative().nullable(),
        entitlements: z.object({
          locations: z.number().int().min(1).max(100),
          staff: z.number().int().min(0).max(100),
          orders: z.boolean(),
          analytics: z.boolean(),
          modules: z.boolean(),
        }),
      })
      .parse(r.body);
    const pid = z
      .string()
      .regex(/^[a-z_]{2,30}$/)
      .parse((r.params as any).pid);
    await asyncDb.transaction(async (tx) => {
      await adminRepository.updatePlan(tx, pid, { name: b.name, entitlements: JSON.stringify(b.entitlements), pricePaise: b.price_paise });
      await auditAsync(u.id, null, "admin.plan", pid, b, tx);
    });
    return { ok: true };
  });
  app.get("/api/admin/tenants/:tid", async (r) => {
    const u = await admin(r),
      tid = (r.params as any).tid;
    if (!await adminRepository.tenantExists(tid))
      fail(404, "Tenant not found");
    await auditAsync(u.id, tid, "admin.view", tid, {});
    return {
      tenant: await ent(tid),
      routes: await paymentRepository.listRoutesForTenant(tid),
      reports: await adminRepository.tenantReports(tid),
      notes: await adminRepository.supportNotes(tid),
      audit: await adminRepository.auditList(tid),
    };
  });
  app.post("/api/admin/tenants/:tid/notes", async (r) => {
    const u = await admin(r),
      tid = (r.params as any).tid,
      b = z.object({ note: z.string().min(3).max(1000) }).parse(r.body);
    if (!await adminRepository.tenantExists(tid))
      fail(404, "Tenant not found");
    await asyncDb.transaction(async (tx) => {
      await adminRepository.createSupportNote(tx, { id: id(), tenantId: tid, actorId: u.id, note: b.note });
      await auditAsync(u.id, tid, "support.note", tid, {}, tx);
    });
    return { ok: true };
  });
  app.post("/api/admin/tenants/:tid/billing", async (r) => {
    const u = await admin(r, true),
      tid = (r.params as any).tid,
      b = z
        .object({
          planId: z.string(),
          state: z.enum(["free", "active", "grace", "expired", "suspended"]),
          reason: z.string().min(10).max(300),
        })
        .parse(r.body);
    if (!await adminRepository.planExists(b.planId))
      fail(400, "Unknown plan");
    await asyncDb.transaction(async (tx) => {
      if (!(await adminRepository.updateBilling(tx, tid, b.planId, b.state)).rowCount)
        fail(404, "Tenant not found");
      await auditAsync(u.id, tid, "billing.manual", tid, b, tx);
    });
    return { ok: true };
  });
  app.post("/api/admin/routes/:rid/verify", async (r) => {
    const u = await admin(r, true),
      rid = (r.params as any).rid,
      b = z.object({ evidence: z.string().min(20).max(500) }).parse(r.body);
    const route = await paymentRepository.getRoute(rid);
    if (!route || route.state !== "verification_pending")
      fail(409, "Route is not awaiting verification");
    if (await businessRepository.getMembership(u.id, route.tenant_id))
      fail(403, "Independent verifier required");
    await asyncDb.transaction(async (tx) => {
      await paymentRepository.verify(tx, rid, u.id, b.evidence);
      await auditAsync(u.id, route.tenant_id, "route.manually_verified", rid, b, tx);
    });
    return { ok: true };
  });
  app.post("/api/admin/reports/:rid/resolve", async (r) => {
    const u = await admin(r, true),
      rid = (r.params as any).rid,
      b = z
        .object({ unpublish: z.boolean(), reason: z.string().min(10).max(300) })
        .parse(r.body);
    const report = await adminRepository.getReport(rid);
    if (!report) fail(404, "Report not found");
    await asyncDb.transaction(async (tx) => {
      await adminRepository.resolveReport(tx, rid, report.location_id, b.unpublish);
      await auditAsync(u.id, report.tenant_id, "report.resolved", rid, b, tx);
    });
    return { ok: true };
  });
  return app;
}
