import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import { randomUUID, randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
import { CustomerRepository } from "./repositories/customer-repository.js";
import { MarketingRepository } from "./repositories/marketing-repository.js";
import { OperationsRealtime } from "./realtime.js";
import { OrderOperationsRepository } from "./repositories/order-operations-repository.js";
import { createWhatsAppProvider } from "./whatsapp.js";
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
  isPrimeEligibleCategory,
} from "./domain.js";
import { normalizeCustomerPhone } from "./customer-phone.js";
const id = () => randomUUID();
const publicId = () => randomBytes(16).toString("hex");
const secret = () => randomBytes(32).toString("hex");
const reservedSlugs = new Set([
  "api", "admin", "login", "signup", "register", "settings", "account",
  "support", "privacy", "terms", "q", "b", "staff", "payments", "orders",
  "menu", "assets", "recovery", "reset", "verify",
]);
const normalizeSlug = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "");
const rewardId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, "Invalid reward");
export const normalizePaymentAmount = (value: unknown) => {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(amount) && amount >= 100 ? amount : null;
};
export { normalizeCustomerPhone };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const fail = (statusCode: number, message: string, code?: string): never => {
  throw Object.assign(new Error(message), { statusCode, appCode: code });
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
      trustProxy: c.NODE_ENV === "production" && !process.env.VERCEL,
    });
  const localMediaRoot = resolve(c.MEDIA_ROOT);
  if (c.STORAGE_DRIVER === "local") mkdirSync(localMediaRoot, { recursive: true });
  await app.register(cookie);
  const browserOrigins = new Set([c.PUBLIC_ORIGIN, c.ADMIN_ORIGIN]);
  const isAllowedBrowserOrigin = (origin: string) => {
    if (browserOrigins.has(origin)) return true;
    // Local Vite may move from 5173 to another port when a stale dev server
    // is already running. Keep development convenient without widening the
    // production allow-list: only loopback HTTP origins are accepted locally.
    if (c.NODE_ENV === "production") return false;
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);
    } catch {
      return false;
    }
  };
  const authRateKey = (action: string) => (r: FastifyRequest) => {
    const body = (r.body || {}) as any;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "anonymous";
    const session = typeof r.headers.authorization === "string" ? hash(r.headers.authorization).slice(0, 16) : "anonymous";
    return `${r.ip}:${action}:${action === "login" || action === "recovery" ? email : session}`;
  };
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || isAllowedBrowserOrigin(origin)),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://checkout.razorpay.com"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "https:", "data:"],
        connectSrc: ["'self'", "https://checkout.razorpay.com", "https://api.razorpay.com"],
        frameSrc: ["'self'", "https://checkout.razorpay.com", "https://api.razorpay.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, {
    max: 150,
    timeWindow: "1 minute",
    keyGenerator: (r) => `${r.ip}:${r.routeOptions.url || r.url}`,
    errorResponseBuilder: (_r, context) => ({
      statusCode: 429,
      code: "RATE_LIMITED",
      error: "Too many attempts. Try again shortly.",
      retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)),
    }),
  });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  await app.register(rawBody, { field: "rawBody", global: false, encoding: "utf8", runFirst: true });
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
  const customerRepository = new CustomerRepository(asyncDb);
  const marketingRepository = new MarketingRepository(asyncDb);
  const realtime = new OperationsRealtime();
  const operationsRepository = new OrderOperationsRepository(asyncDb);
  const whatsappProvider = createWhatsAppProvider(c);
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
  const hasPermission = (u: any, capability: string) => {
    if (u.role === "owner") return true;
    const permissions = u.permissions || {};
    if (permissions[capability] === true || permissions[capability.replace(".", "_")] === true) return true;
    if (capability === "orders.manage" && (permissions["orders.update"] === true || permissions.orders?.update === true)) return true;
    if (capability.endsWith(".view") && permissions[capability.replace(/\.view$/, ".manage")] === true) return true;
    if (u.role === "manager") return ["orders.view", "orders.manage", "orders.kitchen", "orders.service", "orders.close", "orders.cancel_locked_item", "service_requests.view", "service_requests.manage", "billing.view", "billing.manage", "payments.view", "staff.manage"].includes(capability);
    const operational = u.operational_role || "service";
    if (operational === "kitchen") return ["orders.view", "orders.manage", "orders.kitchen"].includes(capability);
    // Service/floor staff may start or finish kitchen workflow when the
    // restaurant has not separated those duties. They still do not receive
    // kitchen-only data or alerts unless explicitly granted elsewhere.
    if (operational === "service") return ["orders.view", "orders.manage", "orders.kitchen", "orders.service", "service_requests.view", "service_requests.manage"].includes(capability);
    if (operational === "cashier") return ["orders.view", "billing.view", "billing.manage", "payments.view", "orders.close"].includes(capability);
    return false;
  };
  const requirePermission = (u: any, capability: string) => { if (!hasPermission(u, capability)) fail(403, "Permission denied"); };
  const marketingPermission = (u: any, capability: string) => {
    if (u.role === "owner") return true;
    const permissions = u.permissions || {};
    const direct = (key: string) => permissions[`marketing.${key}`] === true || permissions.marketing?.[key] === true;
    if (direct(capability)) return true;
    if (direct(`${capability}.manage`)) return true;
    // A manage capability includes the corresponding read capability. This
    // keeps staff permissions expressive without requiring duplicate grants.
    if (capability.endsWith(".manage")) return direct(capability.slice(0, -".manage".length));
    if (capability === "view") return Object.keys(permissions).some((key) => key.startsWith("marketing.") && permissions[key] === true) || Object.values(permissions.marketing || {}).some((value: unknown) => value === true);
    return direct("view");
  };
  const marketingLoc = async (r: FastifyRequest, capability = "view") => {
    const { l, u } = await loc(r);
    if (!marketingPermission(u, capability)) fail(403, "You do not have permission to use marketing");
    return { l, u };
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
    // A published legacy location is already usable even if an older database
    // predates the explicit onboarding_completed flag.
    onboarding: { step: l.onboarding_step || 0, completed: !!l.onboarding_completed || !!l.published },
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
    return { ...u, role: m.role, operational_role: m.operational_role || "service", permissions: typeof m.permissions === "string" ? JSON.parse(m.permissions || "{}") : (m.permissions || {}) };
  };
  const asyncEnt = async (tenant: string) => {
    const t = await asyncDb.get<any>("SELECT t.*,p.entitlements,p.name plan_name,p.price_paise plan_price_paise,EXISTS(SELECT 1 FROM memberships qm JOIN users qu ON qu.id=qm.user_id WHERE qm.tenant_id=t.id AND qm.role='owner' AND qu.account_type='internal_qa') AS internal_qa_authorized FROM tenants t JOIN plans p ON p.id=t.plan_id WHERE t.id=?", [tenant]);
    if (t) t.billing_interval = "month";
    if (!t) fail(404, "Business not found");
    // INTERNAL_QA is a two-part, server-provisioned entitlement. A tenant
    // marker without an explicitly marked owner must never grant paid access.
    if (t.billing_source === "internal_qa" && !t.internal_qa_authorized) {
      t.billing_state = "free";
    }
    return { ...t, entitlements: JSON.parse(t.entitlements) };
  };
  const asyncMenuView = (locationId: string) => menuRepository.getMenu(locationId);
  const asyncView = async (l: any) => ({
    ...l,
    publicId: l.public_id,
    status: l.status || (l.published ? "ACTIVE" : "DRAFT"),
    // A published legacy location is already usable even if an older database
    // predates the explicit onboarding_completed flag.
    onboarding: { step: l.onboarding_step || 0, completed: !!l.onboarding_completed || !!l.published },
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
      !isAllowedBrowserOrigin(r.headers.origin)
    )
      fail(403, "Origin not allowed");
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ code: "VALIDATION_ERROR", error: "Check the highlighted fields and try again." });
    const e = error as any;
    const status = e.statusCode || 500;
    if (status === 429)
      return reply.code(429).send({
        code: "RATE_LIMITED",
        error: "Too many attempts. Try again shortly.",
        retryAfterSeconds: Math.max(1, Number(e.retryAfterSeconds || 60)),
      });
    if (status >= 500) req.log.error({ err: e }, "Request failed");
    const code = e.appCode || (status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : status === 429 ? "RATE_LIMITED" : status >= 500 ? "SERVER_ERROR" : undefined);
    return reply.code(status).send({ code, error: status >= 500 ? "Service unavailable; please retry" : e.message });
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
  app.get("/api/plans", async () => {
    const plans = await asyncDb.all<any>(
      "SELECT id,name,entitlements,price_paise,original_price_paise,currency,business_categories,max_staff,active,display_order,recommended FROM plans WHERE active IS TRUE ORDER BY display_order,id",
    );
    return plans.map((p) => ({ ...p, entitlements: JSON.parse(p.entitlements), business_categories: JSON.parse(p.business_categories || "[]"), billing_interval: "month" }));
  });
  const newSession = async (userId: string, r: FastifyRequest, reply: any) => {
    const token = secret();
    await authRepository.createSession(asyncDb, hash(token), userId, Date.now() + 7 * 86400000);
    const now = new Date().toISOString();
    await asyncDb.run(
      "INSERT INTO login_events(id,user_id,created_at,success,client_type,platform,ip_address,user_agent,session_reference) VALUES (?,?,?,?,?,?,?,?,?)",
      [id(), userId, now, true, String(r.headers["x-client"] || "web"), String(r.headers["x-platform"] || "unknown"), r.ip, String(r.headers["user-agent"] || "unknown").slice(0, 500), hash(token).slice(0, 16)],
    );
    await asyncDb.run("UPDATE users SET last_login_at=?,last_active_at=? WHERE id=?", [now, now, userId]);
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
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes", keyGenerator: authRateKey("signup") } } },
    async (r, reply) => {
      // `name` remains optional for older native clients and API consumers,
      // but account creation is intentionally identity-only. Business name
      // is collected by onboarding after verification.
      const b = credentials
        .extend({ name: z.string().trim().min(2).max(100).optional() })
        .parse(r.body);
      const argon2 = await import("argon2");
      const password = await argon2.hash(b.password);
      const userId = id(),
        tenant = id();
      if (await authRepository.findUserByEmail(b.email))
        fail(409, "An account with this email already exists.", "EMAIL_ALREADY_EXISTS");
      await asyncDb.transaction(async (tx) => {
        await tx.run("INSERT INTO users(id,email,password) VALUES (?,?,?)", [userId, b.email, password]);
        // Tenants predate the separate location/onboarding model and require a
        // name. Keep a neutral placeholder until the first business is saved.
        await tx.run("INSERT INTO tenants(id,name) VALUES (?,?)", [tenant, b.name || "New workspace"]);
        await tx.run("INSERT INTO memberships(user_id,tenant_id,role,permissions) VALUES (?,?,?,'{}')", [userId, tenant, "owner"]);
        await authRepository.audit(tx, userId, tenant, "account.created", tenant, {});
      });
      let verificationEmailSent = false;
      try {
        const verificationToken = secret();
        await asyncDb.transaction(async (tx) => {
          await authRepository.deleteEmailTokens(tx, userId, "verify");
          await authRepository.createEmailToken(tx, hash(verificationToken), userId, "verify", Date.now() + 86400000);
        });
        await sendMail(
          b.email,
          "Verify your 1QR Prime email",
          `Open ${c.PUBLIC_ORIGIN}/verify#${verificationToken} within 24 hours to verify your 1QR Prime account.`,
        );
        verificationEmailSent = true;
      } catch (error) {
        // Account creation is durable even when external mail delivery is
        // unavailable. Keep the account, but record a sanitized provider
        // failure so operators can diagnose domain/SMTP configuration.
        r.log.error(
          {
            event: "verification_email_delivery_failed",
            providerCode:
              error && typeof error === "object" && "providerCode" in error
                ? String((error as { providerCode?: unknown }).providerCode)
                : "UNKNOWN",
          },
          "Verification email delivery failed during registration",
        );
      }
      try {
        const session = await newSession(userId, r, reply);
        // New identity-only registrations use the resource-creation status;
        // preserve 200 for legacy clients that still send the old name field.
        return reply.code(b.name ? 200 : 201).send({ ...session, accountCreated: true, sessionCreated: true, verificationEmailSent });
      } catch {
        // The account is already durable. Let the client offer sign-in rather
        // than presenting a retry that could be mistaken for a new signup.
        return reply.code(201).send({ accountCreated: true, sessionCreated: false, verificationEmailSent });
      }
    },
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "5 minutes", keyGenerator: authRateKey("login") } } },
    async (r, reply) => {
      const b = credentials.parse(r.body);
      const u = await authRepository.findUserByEmail(b.email);
      const argon2 = await import("argon2");
      if (!u || !(await argon2.verify(u.password, b.password)))
        fail(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
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
    { config: { rateLimit: { max: 3, timeWindow: "15 minutes", keyGenerator: authRateKey("recovery") } } },
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
    { config: { rateLimit: { max: 3, timeWindow: "10 minutes", keyGenerator: authRateKey("verification") } } },
    async (r) => {
      const u = await asyncAuth(r);
      const token = secret();
      await asyncDb.transaction(async (tx) => {
        await authRepository.deleteEmailTokens(tx, u.id, "verify");
        await authRepository.createEmailToken(tx, hash(token), u.id, "verify", Date.now() + 86400000);
      });
      try {
        await sendMail(
          u.email,
          "Verify your 1QR Prime email",
          `Open ${c.PUBLIC_ORIGIN}/verify#${token} within 24 hours to verify your email.`,
        );
      } catch (error) {
        r.log.error(
          {
            event: "verification_email_delivery_failed",
            providerCode:
              error && typeof error === "object" && "providerCode" in error
                ? String((error as { providerCode?: unknown }).providerCode)
                : "UNKNOWN",
          },
          "Verification email delivery failed",
        );
        fail(
          503,
          "Verification email delivery is temporarily unavailable. Your account is safe; try again after email service is restored.",
          "VERIFICATION_EMAIL_FAILED",
        );
      }
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
      internalQa: u.account_type === "internal_qa",
      emailVerified: !!u.email_verified,
      tenants: await Promise.all(tenants.map(async (t) => ({ ...t, ...(await asyncEnt(t.id)) }))),
      locations: await Promise.all(locations.map(async (location) => ({ ...await asyncView(location), ...(await businessRepository.getMembership(u.id, location.tenant_id) || {}) }))),
      billing: billingCapabilities,
    };
  });
  app.get("/api/locations/slug-availability", async (r) => {
    await asyncAuth(r);
    const raw = typeof (r.query as any)?.slug === "string" ? (r.query as any).slug : "";
    const slug = normalizeSlug(raw);
    if (slug.length < 3 || slug.length > 60 || reservedSlugs.has(slug)) return { slug, available: false };
    return { slug, available: !(await businessRepository.slugExists(slug)) };
  });
  app.put("/api/tenants/:tid/plan", async (r) => {
    const tid = (r.params as any).tid;
    const u = await membership(r, tid, ["owner"]);
    const b = z.object({ planId: z.string().regex(/^[a-z_]{2,30}$/) }).parse(r.body);
    const plan = await asyncDb.get<any>("SELECT id FROM plans WHERE id=? AND active IS TRUE", [b.planId]);
    if (!plan) fail(400, "That plan is not available");
    if (b.planId === "prime") {
      const locations = await asyncDb.all<any>("SELECT category FROM locations WHERE tenant_id=?", [tid]);
      if (locations.some((location) => !isPrimeEligibleCategory(location.category)))
        fail(403, "Prime is currently available for restaurants, cafes and hotels.", "PLAN_NOT_ELIGIBLE");
    }
    await asyncDb.transaction(async (tx) => {
      await tx.run("UPDATE tenants SET plan_id=?,billing_state=?,billing_source='standard' WHERE id=?", [b.planId, "free", tid]);
      await authRepository.audit(tx, u.id, tid, "plan.selected", tid, { planId: b.planId, activation: "pending" });
    });
    return { ok: true, planId: b.planId, billingState: "free" };
  });
  app.post("/api/sales/leads", async (r) => {
    const u = await auth(r);
    const b = z.object({
      businessName: z.string().trim().min(2).max(120),
      category: z.enum(categories),
      email: z.email().max(254),
      phone: z.string().trim().min(7).max(24),
      city: z.string().trim().min(2).max(100),
      locationCount: z.number().int().min(1).max(1000),
      teamSize: z.number().int().min(1).max(100000).nullable().optional(),
      website: z.string().max(2048).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }).parse(r.body);
    const leadId = id();
    await asyncDb.run(
      "INSERT INTO sales_leads(id,user_id,business_name,category,email,phone,city,location_count,team_size,website,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [leadId, u.id, b.businessName, b.category, b.email.toLowerCase(), b.phone, b.city, b.locationCount, b.teamSize ?? null, b.website ?? null, b.notes ?? null],
    );
    return { ok: true, leadId, status: "NEW" };
  });
  app.post("/api/billing/checkout/order", async (r) => {
    const b = z.object({ planCode: z.literal("prime"), locationId: z.uuid() }).parse(r.body);
    const location = await businessRepository.getLocation(b.locationId);
    if (!location) fail(404, "Business not found");
    const u = await membership(r, location.tenant_id, ["owner"]);
    if (!isPrimeEligibleCategory(location.category))
      fail(403, "Prime is currently available for restaurants, cafes and hotels.", "PLAN_NOT_ELIGIBLE");
    const plan = await asyncDb.get<any>("SELECT id,name,price_paise,currency FROM plans WHERE id=? AND active IS TRUE", [b.planCode]);
    if (!plan) fail(400, "That plan is not available");
    const amountPaise = normalizePaymentAmount(plan.price_paise);
    if (amountPaise === null)
      fail(400, "Payment amount is invalid", "VALIDATION_ERROR");
    if (!c.RAZORPAY_KEY_ID || !c.RAZORPAY_KEY_SECRET) {
      r.log.error({
        event: "razorpay_order_create_failed",
        provider: "razorpay",
        reason: "missing_runtime_configuration",
        keyIdPresent: Boolean(c.RAZORPAY_KEY_ID),
        keySecretPresent: Boolean(c.RAZORPAY_KEY_SECRET),
        keyIdMode: c.RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "live" : c.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ? "test" : "unknown",
      }, "Razorpay runtime configuration is incomplete");
      fail(503, "Payments are temporarily unavailable.", "PAYMENT_UNAVAILABLE");
    }
    const receipt = `prime_${id().replaceAll("-", "")}`;
    r.log.info({ event: "razorpay_order_create_started", amount: amountPaise, currency: plan.currency || "INR" }, "Razorpay order creation started");
    let response: Response | undefined;
    try {
      response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${c.RAZORPAY_KEY_ID}:${c.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: amountPaise, currency: plan.currency || "INR", receipt, notes: { tenant_id: location.tenant_id, plan_id: plan.id } }),
      });
    } catch (error) {
      r.log.error({ event: "razorpay_order_create_failed", provider: "razorpay", error: error instanceof Error ? error.message : "request failed" }, "Razorpay order request failed");
      fail(502, "Payments are temporarily unavailable.", "PAYMENT_UNAVAILABLE");
    }
    if (!response) fail(502, "Payments are temporarily unavailable.", "PAYMENT_UNAVAILABLE");
    const providerResponse = response as Response;
    const providerBody = await providerResponse.text();
    let providerError: any = {};
    try { providerError = providerBody ? JSON.parse(providerBody) : {}; } catch { providerError = {}; }
    if (!providerResponse.ok) {
      r.log.error({ event: "razorpay_order_create_failed", provider: "razorpay", upstreamStatus: providerResponse.status, upstreamCode: providerError?.error?.code, upstreamDescription: providerError?.error?.description }, "Razorpay rejected order creation");
      fail(502, "Payments are temporarily unavailable.", "PAYMENT_UNAVAILABLE");
    }
    const order = providerError as { id?: string; amount?: number; currency?: string };
    if (!order.id || order.amount !== amountPaise) {
      r.log.error({ event: "razorpay_order_create_failed", provider: "razorpay", upstreamStatus: providerResponse.status, reason: "unexpected order response" }, "Razorpay returned an invalid order response");
      fail(502, "Payments are temporarily unavailable.", "PAYMENT_UNAVAILABLE");
    }
    r.log.info({ event: "razorpay_order_create_succeeded", provider: "razorpay", amount: order.amount, currency: order.currency || "INR" }, "Razorpay order created");
    await asyncDb.run(
      "INSERT INTO billing_payments(id,user_id,tenant_id,plan_id,provider_order_id,amount_paise,currency,status,receipt) VALUES (?,?,?,?,?,?,?,?,?)",
      [id(), u.id, location.tenant_id, plan.id, order.id, amountPaise, order.currency || "INR", "CREATED", receipt],
    );
    return { order_id: order.id, orderId: order.id, amount: order.amount, currency: order.currency || "INR", keyId: c.RAZORPAY_KEY_ID, planCode: plan.id };
  });
  app.post("/api/billing/checkout/verify", async (r) => {
    const b = z.object({ razorpayPaymentId: z.string().min(4).max(100), razorpayOrderId: z.string().min(4).max(100), razorpaySignature: z.string().length(64) }).parse(r.body);
    if (!c.RAZORPAY_KEY_SECRET) fail(503, "Payments are temporarily unavailable.", "PAYMENT_UNAVAILABLE");
    const razorpaySecret = c.RAZORPAY_KEY_SECRET as string;
    const payment = await asyncDb.get<any>("SELECT * FROM billing_payments WHERE provider_order_id=?", [b.razorpayOrderId]);
    if (!payment) fail(404, "Payment order not found", "PAYMENT_VERIFICATION_FAILED");
    await membership(r, payment.tenant_id, ["owner"]);
    if (payment.status === "VERIFIED") return { ok: true, status: "VERIFIED" };
    const expected = createHmac("sha256", razorpaySecret).update(`${b.razorpayOrderId}|${b.razorpayPaymentId}`).digest("hex");
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(b.razorpaySignature))) fail(400, "Payment verification failed", "PAYMENT_VERIFICATION_FAILED");
    await asyncDb.transaction(async (tx) => {
      const changed = await tx.run("UPDATE billing_payments SET provider_payment_id=?,status='VERIFIED',verified_at=CURRENT_TIMESTAMP WHERE provider_order_id=? AND status='CREATED'", [b.razorpayPaymentId, b.razorpayOrderId]);
      if (!changed.rowCount) return;
      await tx.run("UPDATE tenants SET plan_id=?,billing_state='active',billing_source='standard' WHERE id=?", [payment.plan_id, payment.tenant_id]);
      await authRepository.audit(tx, payment.user_id, payment.tenant_id, "billing.payment.verified", payment.id, { provider: "razorpay", providerOrderId: b.razorpayOrderId });
    });
    return { ok: true, status: "VERIFIED" };
  });
  app.post("/api/locations", async (r) => {
    const b = z
      .object({
        tenantId: z.uuid(),
        name: z.string().min(2).max(100),
        slug: z.string().min(1).max(120).transform(normalizeSlug).refine((value) => value.length >= 3 && value.length <= 60 && !reservedSlugs.has(value), "Choose a different business URL"),
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
      fail(409, "That URL was just taken. Choose another one.", "SLUG_TAKEN");
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
      await tx.run("UPDATE tenants SET name=? WHERE id=? AND name IN ('New workspace','Workspace')", [b.name, b.tenantId]);
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
  app.post("/api/locations/:lid/publish", async (r) => {
    const l = await businessRepository.getLocation((r.params as any).lid);
    if (!l) fail(404, "Business not found", "BUSINESS_NOT_FOUND");
    const u = await asyncMembership(r, l.tenant_id, ["owner"]);
    if (l.published || l.status === "ACTIVE") {
      const current = await asyncView(l);
      return {
        published: true,
        businessId: l.id,
        publicId: l.public_id,
        slug: l.slug,
        publicUrl: `${c.PUBLIC_ORIGIN.replace(/\/$/, "")}/b/${l.slug}`,
        qrUrl: `${c.PUBLIC_ORIGIN.replace(/\/$/, "")}/q/${l.public_id}`,
        location: current,
      };
    }
    if (!["restaurant", "cafe", "hotel"].includes(l.category))
      fail(403, "Publishing is not available for this business category.", "PUBLISH_FORBIDDEN");
    if ((l.onboarding_step || 0) < 3 || !l.slug)
      fail(409, "Finish the remaining setup steps before publishing your business.", "BUSINESS_NOT_READY");
    const tenant = await asyncEnt(l.tenant_id);
    if (!tenant.plan_id || tenant.plan_id !== "prime") fail(402, "Choose and activate Prime before publishing your business.", "PLAN_REQUIRED");
    if (tenant.billing_state !== "active") fail(402, "Complete Prime checkout before publishing your business.", "PLAN_NOT_ACTIVE");
    await asyncDb.transaction(async (tx) => {
      const changed = await tx.run("UPDATE locations SET published=TRUE,status='ACTIVE',onboarding_completed=TRUE,version=version+1 WHERE id=? AND published=FALSE", [l.id]);
      if (!changed.rowCount) return;
      await authRepository.audit(tx, u.id, l.tenant_id, "location.published", l.id, { publicId: l.public_id, slug: l.slug });
    });
    const published = await asyncView(await businessRepository.getLocation(l.id));
    return {
      published: true,
      businessId: l.id,
      publicId: l.public_id,
      slug: l.slug,
      publicUrl: `${c.PUBLIC_ORIGIN.replace(/\/$/, "")}/b/${l.slug}`,
      qrUrl: `${c.PUBLIC_ORIGIN.replace(/\/$/, "")}/q/${l.public_id}`,
      location: published,
    };
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
      if (b.name) await tx.run("UPDATE tenants SET name=? WHERE id=? AND name IN ('New workspace','Workspace')", [b.name, l.tenant_id]);
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
  app.get("/api/locations/:lid/tables/:tid/assignees", async (r) => {
    const { l } = await loc(r);
    const table = await tableRepository.get((r.params as any).tid, l.id);
    if (!table) fail(404, "Table not found");
    return { staff: await asyncDb.all<any>("SELECT u.id,u.email,u.last_active_at FROM table_staff_assignments a JOIN users u ON u.id=a.user_id WHERE a.table_id=? AND a.tenant_id=? ORDER BY u.email", [table.id, l.tenant_id]) };
  });
  app.put("/api/locations/:lid/tables/:tid/assignees", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager"]);
    if (u.role === "manager" && !u.permissions?.staff?.manage && !u.permissions?.orders?.update) fail(403, "Permission denied");
    const table = await tableRepository.get((r.params as any).tid, l.id);
    if (!table) fail(404, "Table not found");
    const body = z.object({ userIds: z.array(z.uuid()).max(20) }).parse(r.body || {});
    const users = body.userIds.length ? await asyncDb.all<any>(`SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? AND m.role!='owner' AND u.id IN (${body.userIds.map(() => "?").join(",")})`, [l.tenant_id, ...body.userIds]) : [];
    if (users.length !== body.userIds.length) fail(400, "Every assignee must be an active team member");
    await asyncDb.transaction(async (tx) => {
      await tx.run("DELETE FROM table_staff_assignments WHERE table_id=? AND tenant_id=?", [table.id, l.tenant_id]);
      for (const member of users) await tx.run("INSERT INTO table_staff_assignments(table_id,user_id,tenant_id) VALUES (?,?,?)", [table.id, member.id, l.tenant_id]);
      await auditAsync(u.id, l.tenant_id, "restaurant.table.assignees_updated", table.id, { userIds: body.userIds }, tx);
    });
    return { ok: true, userIds: body.userIds };
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
    const s3Region = c.S3_ENDPOINT?.includes(".r2.cloudflarestorage.com") ? "auto" : c.AWS_REGION;
    try {
      await new S3Client({
        region: s3Region,
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
    } catch (error) {
      app.log.error({ err: error, driver: "s3", bucket: c.S3_BUCKET }, "image upload failed");
      fail(503, "Image storage is temporarily unavailable. Check the R2 connection and try again.");
    }
    await auditAsync(u.id, l.tenant_id, "image.uploaded", l.id, { key, driver: "s3" });
    return { url: `${c.S3_PUBLIC_ORIGIN?.replace(/\/$/, "")}/${key}` };
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
    const { l, u } = await loc(r, ["owner", "manager", "staff"]);
    if (u.role !== "owner" && !u.permissions?.["payments.request_change"])
      fail(403, "You do not have permission to request payment changes");
    if (u.role === "owner" && c.NODE_ENV === "production" && !u.email_verified)
      fail(403, "Verify your email before adding payment routes");
    const b = z
      .object({
        label: z.string().min(2).max(60),
        vpa: z.string().regex(/^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/),
        payee: z.string().min(2).max(80),
      })
      .parse(r.body);
    const existingRoute = await paymentRepository.findEquivalentRoute(l.id, b.label, b.vpa, b.payee);
    if (existingRoute) return { id: existingRoute.id, existing: true };
    const rid = id();
    const owner = await asyncDb.get<any>("SELECT u.id,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? AND m.role='owner' ORDER BY u.id LIMIT 1", [l.tenant_id]);
    if (!owner) fail(409, "Business owner unavailable");
    const approvalToken = secret(), approvalExpires = new Date(Date.now() + 24 * 3600000).toISOString();
    await asyncDb.transaction(async (tx) => {
      await paymentRepository.createRoute(tx, { id: rid, locationId: l.id, ...b });
      await paymentRepository.createOwnerApproval(tx, { id: id(), routeId: rid, tenantId: l.tenant_id, requestedBy: u.id, ownerUserId: owner.id, tokenHash: hash(approvalToken), expiresAt: approvalExpires });
      await auditAsync(u.id, l.tenant_id, "route.created", rid, b, tx);
    });
    let confirmationDelivery: "sent" | "failed" = "sent";
    try {
      await sendMail(owner.email, "Confirm your 1QR Prime payment destination", `${u.email} requested a payment destination change for ${l.name}.\n\nBusiness: ${l.name}\nPayment destination: ${b.vpa.replace(/^(.{2}).*(@.*)$/, "$1••••$2")}\nPayee: ${b.payee}\n\nConfirm payment destination: ${c.PUBLIC_ORIGIN}/payment-routes/confirm/${approvalToken}\n\nIf you did not request this change, do not approve it.`);
    } catch (error) {
      confirmationDelivery = "failed";
      app.log.error({ err: error, routeId: rid }, "payment destination confirmation email failed");
    }
    return { id: rid, confirmationDelivery };
  });
  app.post("/api/locations/:lid/routes/:rid/resend-confirmation", async (r) => {
    const { l, u } = await loc(r, ["owner"]);
    const rid = String((r.params as any).rid);
    const route = await paymentRepository.getRoute(rid);
    if (!route || route.location_id !== l.id || route.state !== "draft")
      fail(404, "Payment destination is not available for confirmation");
    const owner = await asyncDb.get<any>(
      "SELECT u.id,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? AND m.role='owner' ORDER BY u.id LIMIT 1",
      [l.tenant_id],
    );
    if (!owner) fail(409, "Business owner unavailable");
    const approvalToken = secret();
    const approvalExpires = new Date(Date.now() + 24 * 3600000).toISOString();
    await asyncDb.transaction(async (tx) => {
      const rotated = await paymentRepository.rotateOwnerApproval(tx, rid, hash(approvalToken), approvalExpires);
      if (!rotated.rowCount) fail(409, "Confirmation request is unavailable");
      await auditAsync(u.id, l.tenant_id, "route.owner_confirmation_resent", rid, {}, tx);
    });
    await sendMail(
      owner.email,
      "Confirm your 1QR Prime payment destination",
      `${u.email} requested a new confirmation link for ${l.name}.\n\nBusiness: ${l.name}\nPayment destination: ${String(route.vpa).replace(/^(.{2}).*(@.*)$/, "$1••••$2")}\nPayee: ${route.payee}\n\nConfirm payment destination: ${c.PUBLIC_ORIGIN}/payment-routes/confirm/${approvalToken}\n\nIf you did not request this change, do not approve it.`,
    );
    return { ok: true, confirmationDelivery: "sent" };
  });
  app.post(
    "/api/locations/:lid/routes/:rid/request-verification",
    async (r) => {
      const { l, u } = await loc(r, ["owner"]);
      const b = z
        .object({ evidence: z.string().min(10).max(500) })
        .parse(r.body);
      await asyncDb.transaction(async (tx) => {
        const approval = await tx.get<any>("SELECT status FROM payment_route_approvals WHERE route_id=? ORDER BY created_at DESC LIMIT 1", [(r.params as any).rid]);
        if (c.NODE_ENV !== "test" && (!approval || approval.status !== "owner_approved")) fail(409, "Owner approval is required before verification");
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
  app.get("/api/payment-routes/confirm/:token", async (r) => {
    const token = String((r.params as any).token);
    if (!/^[a-f0-9]{64}$/.test(token)) fail(400, "Invalid confirmation link");
    const approval = await paymentRepository.approval(hash(token));
    if (!approval || approval.status !== "pending_owner_approval" || new Date(approval.expires_at).getTime() <= Date.now()) fail(400, "Confirmation link expired or unavailable");
    return { business: approval.business_name, label: approval.label, payee: approval.payee, vpa: approval.vpa.replace(/^(.{2}).*(@.*)$/, "$1••••$2"), expiresAt: approval.expires_at };
  });
  app.post("/api/payment-routes/confirm/:token", async (r) => {
    const token = String((r.params as any).token);
    if (!/^[a-f0-9]{64}$/.test(token)) fail(400, "Invalid confirmation link");
    const approval = await paymentRepository.approval(hash(token));
    if (!approval || approval.status !== "pending_owner_approval" || new Date(approval.expires_at).getTime() <= Date.now()) fail(400, "Confirmation link expired or unavailable");
    await asyncDb.transaction(async (tx) => {
      if (!(await paymentRepository.approveOwner(tx, approval.id, approval.owner_user_id)).rowCount) fail(409, "Confirmation link is no longer valid");
      await auditAsync(approval.owner_user_id, approval.tenant_id, "route.owner_approved", approval.route_id, { route: approval.label }, tx);
    });
    return { ok: true, status: "owner_approved", next: "independent_verification" };
  });
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
      promotions: await marketingRepository.activePromotions(l.id),
      challenges: await marketingRepository.activeChallenges(l.id),
      table: table ? { id: table.id, name: table.name, publicToken: table.public_token } : null,
      paymentAvailable: !!l.active_route_id,
    };
  });
  app.get("/api/public/:slug/promotions/:pid", async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const promotion = await marketingRepository.publicPromotion(l.id, (r.params as any).pid);
    if (!promotion) fail(404, "Offer not found");
    return promotion;
  });
  app.post("/api/public/:slug/rewards", async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const body = z.object({ customerPhone: z.string().trim().min(1).max(32) }).parse(r.body);
    const phone = normalizeCustomerPhone(body.customerPhone);
    if (!phone) fail(400, "Enter a valid Indian mobile number", "INVALID_CUSTOMER_PHONE");
    return { rewards: await marketingRepository.publicRewards(l.id, phone as string) };
  });
  app.post("/api/public/:slug/rewards/quote", async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const body = z.object({
      customerPhone: z.string().trim().min(1).max(32),
      rewardEntitlementId: rewardId,
      lines: z.array(z.object({ itemId: z.uuid(), quantity: z.number().int().min(1).max(20) })).min(1).max(50),
      orderType: z.enum(["dine_in", "takeaway", "delivery"]).default("takeaway"),
    }).parse(r.body);
    const phone = normalizeCustomerPhone(body.customerPhone);
    if (!phone) fail(400, "Enter a valid Indian mobile number", "INVALID_CUSTOMER_PHONE");
    const profile = profileSchema.parse(JSON.parse(l.profile));
    return orderRepository.quoteReward({ location: l, profile, customerPhone: phone as string, rewardEntitlementId: body.rewardEntitlementId, lines: body.lines, orderType: body.orderType });
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
  app.post("/api/public/:slug/marketing/opt-out", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const b = z.object({ customerPhone: z.string().trim().min(1).max(32) }).parse(r.body);
    const phone = normalizeCustomerPhone(b.customerPhone);
    // Keep the response intentionally generic so an unknown phone cannot be
    // used to enumerate a business's customer list.
    if (phone) {
      const customer = await customerRepository.recordActivity(asyncDb, { tenantId: l.tenant_id, locationId: l.id, phoneE164: phone, source: "public_opt_out" });
      await customerRepository.setConsent(asyncDb, { tenantId: l.tenant_id, customerId: customer.id, businessId: l.id, status: "opted_out", source: "public_opt_out" });
    }
    return { ok: true, message: "If this number was subscribed, marketing messages will stop." };
  });

  app.get("/api/webhooks/whatsapp", async (r, reply) => {
    const query = r.query as any;
    if (query["hub.mode"] !== "subscribe" || !c.WHATSAPP_WEBHOOK_VERIFY_TOKEN || query["hub.verify_token"] !== c.WHATSAPP_WEBHOOK_VERIFY_TOKEN) return reply.code(403).send({ error: "Webhook verification failed" });
    return reply.type("text/plain").send(String(query["hub.challenge"] || ""));
  });
  app.post("/api/webhooks/whatsapp", { config: { rawBody: true } }, async (r, reply) => {
    const raw = String((r as any).rawBody || "");
    if (!raw || !whatsappProvider.verifyWebhook(raw, r.headers["x-hub-signature-256"] as string | undefined)) return reply.code(401).send({ error: "Invalid webhook signature" });
    const events = whatsappProvider.normalizeWebhook((r as any).body);
    let accepted = 0;
    for (const event of events) {
      const inserted = await asyncDb.run("INSERT INTO whatsapp_webhook_events(id,provider_message_id,status,received_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(provider_message_id,status) DO NOTHING", [id(), event.providerMessageId, event.status]);
      if (inserted.rowCount !== 1) continue;
      accepted++;
      const timestamp = event.status === "sent" ? "sent_at" : event.status === "delivered" ? "delivered_at" : event.status === "read" ? "read_at" : "failed_at";
      await asyncDb.run(`UPDATE campaign_recipients SET status=?,${timestamp}=CURRENT_TIMESTAMP,failure_code=? WHERE provider_message_id=?`, [event.status, event.failureCode || null, event.providerMessageId]);
    }
    return { received: events.length, accepted };
  });

  app.get("/api/locations/:lid/marketing", async (r) => {
    const { l } = await marketingLoc(r, "view");
    const [customers, subscribers, promotions, challenges, campaigns, whatsappConnection] = await Promise.all([
      asyncDb.get<any>("SELECT count(*) n FROM customers WHERE tenant_id=?", [l.tenant_id]),
      asyncDb.get<any>("SELECT count(*) n FROM customer_consents WHERE tenant_id=? AND channel='whatsapp' AND purpose='marketing' AND status='opted_in'", [l.tenant_id]),
      asyncDb.get<any>("SELECT count(*) n FROM promotions WHERE location_id=? AND status IN ('scheduled','active') AND start_at<=? AND end_at>?", [l.id, new Date().toISOString(), new Date().toISOString()]),
      asyncDb.get<any>("SELECT count(*) n FROM challenges WHERE location_id=? AND status IN ('scheduled','active') AND start_at<=? AND end_at>?", [l.id, new Date().toISOString(), new Date().toISOString()]),
      marketingRepository.listCampaigns(l.tenant_id, l.id),
      asyncDb.get<any>("SELECT status FROM marketing_connections WHERE tenant_id=? AND (location_id=? OR location_id IS NULL) AND provider='meta_cloud_api' ORDER BY location_id NULLS LAST LIMIT 1", [l.tenant_id, l.id]),
    ]);
    return { customers: Number(customers?.n || 0), subscribers: Number(subscribers?.n || 0), activePromotions: Number(promotions?.n || 0), activeChallenges: Number(challenges?.n || 0), campaigns, whatsappConnection: whatsappConnection?.status || "not_connected" };
  });
  app.get("/api/locations/:lid/marketing/customers", async (r) => {
    const { l } = await marketingLoc(r, "customers");
    const query = z.object({ q: z.string().max(80).default(""), status: z.enum(["opted_in", "opted_out"]).optional() }).parse(r.query);
    return customerRepository.list(l.tenant_id, query.q, query.status);
  });
  app.get("/api/locations/:lid/marketing/customers/:cid", async (r) => {
    const { l } = await marketingLoc(r, "customers");
    const customer = await customerRepository.findById(l.tenant_id, (r.params as any).cid);
    if (!customer) fail(404, "Customer not found");
    const [orders, campaigns, progress] = await Promise.all([
      asyncDb.all<any>("SELECT id,public_order_number,state,amount_paise,created_at FROM orders WHERE location_id=? AND customer_id=? ORDER BY created_at DESC LIMIT 50", [l.id, customer.id]),
      asyncDb.all<any>("SELECT c.name,c.status,cr.status recipient_status,cr.sent_at FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id WHERE c.tenant_id=? AND cr.customer_id=? ORDER BY c.created_at DESC LIMIT 50", [l.tenant_id, customer.id]),
      asyncDb.all<any>("SELECT cp.progress,cp.target,cp.status,ch.customer_title,ch.end_at FROM challenge_progress cp JOIN challenges ch ON ch.id=cp.challenge_id WHERE cp.customer_id=? AND ch.tenant_id=? ORDER BY ch.end_at DESC LIMIT 20", [customer.id, l.tenant_id]),
    ]);
    return { customer, orders: orders.map((order) => ({ ...order, amount_paise: Number(order.amount_paise || 0) })), campaigns, challenges: progress };
  });
  app.get("/api/locations/:lid/marketing/campaigns", async (r) => {
    const { l } = await marketingLoc(r, "campaigns");
    return marketingRepository.listCampaigns(l.tenant_id, l.id);
  });
  app.get("/api/locations/:lid/marketing/templates", async (r) => {
    const { l } = await marketingLoc(r, "campaigns");
    return asyncDb.all<any>("SELECT id,name,language,body_preview,status,rejection_reason FROM whatsapp_templates WHERE tenant_id=? ORDER BY name", [l.tenant_id]);
  });
  app.post("/api/locations/:lid/marketing/campaigns", async (r) => {
    const { l, u } = await marketingLoc(r, "campaigns.manage");
    const b = z.object({ name: z.string().trim().min(2).max(120), templateId: z.uuid().optional(), audience: z.object({ segment: z.enum(["all_opted_in", "new", "repeat", "inactive"]).default("all_opted_in"), days: z.number().int().min(1).max(365).optional(), minSpendPaise: z.number().int().min(0).max(100000000).optional() }).default({ segment: "all_opted_in" }), promotionId: z.uuid().optional(), challengeId: z.uuid().optional(), scheduledAt: z.iso.datetime().optional() }).parse(r.body);
    if (b.templateId && !(await asyncDb.get("SELECT 1 FROM whatsapp_templates WHERE id=? AND tenant_id=?", [b.templateId, l.tenant_id]))) fail(403, "Template does not belong to this business");
    if (b.promotionId && !(await asyncDb.get("SELECT 1 FROM promotions WHERE id=? AND tenant_id=? AND location_id=?", [b.promotionId, l.tenant_id, l.id]))) fail(403, "Promotion does not belong to this business");
    if (b.challengeId && !(await asyncDb.get("SELECT 1 FROM challenges WHERE id=? AND tenant_id=? AND location_id=?", [b.challengeId, l.tenant_id, l.id]))) fail(403, "Challenge does not belong to this business");
    if (b.scheduledAt && new Date(b.scheduledAt).getTime() <= Date.now()) fail(400, "Campaign schedule must be in the future");
    const campaignId = id();
    const created = await marketingRepository.createCampaign(asyncDb, { id: campaignId, tenantId: l.tenant_id, locationId: l.id, name: b.name, templateId: b.templateId, audience: b.audience, promotionId: b.promotionId, challengeId: b.challengeId, scheduledAt: b.scheduledAt, actorId: u.id });
    await auditAsync(u.id, l.tenant_id, "marketing.campaign.created", campaignId, { name: b.name, audience: b.audience });
    if (b.scheduledAt) {
      await marketingRepository.queueRecipients(asyncDb, campaignId, l.tenant_id, b.audience);
      await marketingRepository.enqueueCampaignDelivery(asyncDb, { id: id(), tenantId: l.tenant_id, campaignId, availableAt: b.scheduledAt });
    }
    return { ...created, audience: CustomerRepository.parseAudience(created?.audience_json), recipientCount: b.scheduledAt ? (await marketingRepository.listRecipients(campaignId, l.tenant_id)).length : 0 };
  });
  app.post("/api/locations/:lid/marketing/campaigns/:cid/send", async (r) => {
    const { l, u } = await marketingLoc(r, "campaigns.manage");
    const campaign = await asyncDb.get<any>("SELECT * FROM campaigns WHERE id=? AND tenant_id=? AND location_id=?", [(r.params as any).cid, l.tenant_id, l.id]);
    if (!campaign) fail(404, "Campaign not found");
    const connection = await asyncDb.get<any>("SELECT status FROM marketing_connections WHERE tenant_id=? AND (location_id=? OR location_id IS NULL) AND provider='meta_cloud_api' ORDER BY location_id NULLS LAST LIMIT 1", [l.tenant_id, l.id]);
    const template = campaign.template_id ? await asyncDb.get<any>("SELECT * FROM whatsapp_templates WHERE id=? AND tenant_id=?", [campaign.template_id, l.tenant_id]) : undefined;
    if (!connection || connection.status !== "connected" || !template || template.status !== "approved") fail(503, "Connect WhatsApp and choose an approved template before sending");
    await marketingRepository.queueRecipients(asyncDb, campaign.id, l.tenant_id, CustomerRepository.parseAudience(campaign.audience_json));
    const recipientCount = (await marketingRepository.listRecipients(campaign.id, l.tenant_id)).length;
    await auditAsync(u.id, l.tenant_id, "marketing.campaign.send_requested", campaign.id, { recipientCount });
    // Delivery is deliberately not performed in the request. A durable worker
    // must claim recipients, re-check consent, pace provider calls and record
    // idempotent outcomes before this endpoint can report a queued send.
    void whatsappProvider;
    fail(503, "Campaign delivery worker is not configured", "WHATSAPP_WORKER_NOT_CONFIGURED");
  });
  app.get("/api/locations/:lid/marketing/promotions", async (r) => {
    const { l } = await marketingLoc(r, "view");
    return marketingRepository.listPromotions(l.id, l.tenant_id);
  });
  app.post("/api/locations/:lid/marketing/promotions", async (r) => {
    const { l, u } = await marketingLoc(r, "promotions.manage");
    const b = z.object({ name: z.string().trim().min(2).max(100), customerTitle: z.string().trim().min(2).max(120), description: z.string().max(500).default(""), imageUrl: link.nullable().optional(), type: z.enum(["percentage", "flat", "special_price"]), valuePaise: z.number().int().positive().max(100000000), target: z.object({ itemIds: z.array(z.uuid()).max(100).default([]), categoryIds: z.array(z.uuid()).max(100).default([]), allMenu: z.boolean().default(false) }).default({ itemIds: [], categoryIds: [], allMenu: false }), startAt: z.iso.datetime(), endAt: z.iso.datetime(), recurrence: z.record(z.string(), z.unknown()).optional(), priority: z.number().int().min(0).max(1000).default(0), stackable: z.boolean().default(false) }).parse(r.body);
    if (new Date(b.endAt).getTime() <= new Date(b.startAt).getTime()) fail(400, "Promotion end must be after its start");
    if (b.type === "percentage" && b.valuePaise > 10000) fail(400, "Percentage discount cannot exceed 100%");
    for (const itemId of b.target.itemIds) if (!(await menuRepository.itemInLocation(itemId, l.id))) fail(403, "Promotion item does not belong to this business");
    for (const categoryId of b.target.categoryIds) if (!(await menuRepository.categoryInLocation(categoryId, l.id))) fail(403, "Promotion category does not belong to this business");
    if (!b.target.allMenu && !b.target.itemIds.length && !b.target.categoryIds.length) fail(400, "Choose what this promotion applies to");
    const promotionId = id();
    const status = new Date(b.startAt).getTime() <= Date.now() ? "active" : "scheduled";
    const created = await marketingRepository.createPromotion(asyncDb, { ...b, id: promotionId, tenantId: l.tenant_id, locationId: l.id, actorId: u.id, status });
    await auditAsync(u.id, l.tenant_id, "marketing.promotion.created", promotionId, { name: b.name, type: b.type });
    return created;
  });
  app.get("/api/locations/:lid/marketing/challenges", async (r) => {
    const { l } = await marketingLoc(r, "view");
    return marketingRepository.listChallenges(l.id, l.tenant_id);
  });
  app.post("/api/locations/:lid/marketing/challenges", async (r) => {
    const { l, u } = await marketingLoc(r, "challenges.manage");
    const b = z.object({ name: z.string().trim().min(2).max(100), customerTitle: z.string().trim().min(2).max(120), description: z.string().max(500).default(""), imageUrl: link.nullable().optional(), ruleType: z.enum(["ORDER_COUNT", "VISIT_COUNT", "SPEND_AMOUNT", "ITEM_QUANTITY", "CATEGORY_QUANTITY"]), target: z.number().int().positive().max(1000000), rewardType: z.enum(["flat_discount", "percentage_discount", "item"]), rewardValue: z.number().int().positive().max(100000000), rewardItemId: z.uuid().optional(), startAt: z.iso.datetime(), endAt: z.iso.datetime(), showInMenu: z.boolean().default(true), featured: z.boolean().default(false) }).parse(r.body);
    if (new Date(b.endAt).getTime() <= new Date(b.startAt).getTime()) fail(400, "Challenge end must be after its start");
    if (b.rewardType === "percentage_discount" && b.rewardValue > 10000) fail(400, "Percentage reward cannot exceed 100%");
    if (b.rewardType === "item" && !b.rewardItemId) fail(400, "Choose the reward menu item");
    if (b.rewardItemId && !(await menuRepository.itemInLocation(b.rewardItemId, l.id))) fail(403, "Reward item does not belong to this business");
    const challengeId = id();
    const status = new Date(b.startAt).getTime() <= Date.now() ? "active" : "scheduled";
    const created = await marketingRepository.createChallenge(asyncDb, { ...b, id: challengeId, tenantId: l.tenant_id, locationId: l.id, actorId: u.id, status });
    await auditAsync(u.id, l.tenant_id, "marketing.challenge.created", challengeId, { name: b.name, ruleType: b.ruleType });
    return created;
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
          whatsappMarketingConsent: z.boolean().default(false),
          rewardEntitlementId: rewardId.optional(),
          deliveryAddress: z.string().max(500).default(""),
          landmark: z.string().max(200).default(""),
        })
        .parse(r.body);
      const normalizedOrderPhone = b.customerPhone ? normalizeCustomerPhone(b.customerPhone) : null;
      if (b.customerPhone && !normalizedOrderPhone) fail(400, "Enter a valid Indian mobile number", "INVALID_CUSTOMER_PHONE");
      const orderBody = { ...b, customerPhone: normalizedOrderPhone || "" };
      const fingerprint = hash(JSON.stringify(orderBody));
      const tenantAccount = await ent(l.tenant_id);
      const created = await orderRepository.create({
        location: l,
        tenantAccount,
        profile: profileSchema.parse(typeof l.profile === "string" ? JSON.parse(l.profile) : l.profile),
        body: orderBody,
        fingerprint,
      });
      realtime.emit({
        id: id(), tenantId: l.tenant_id, locationId: l.id, kind: "order.created", audience: "kitchen",
        data: { orderId: created.order.id, orderNumber: created.order.public_order_number, orderType: created.order.order_type, tableName: created.order.table_name_snapshot || null, lines: typeof created.order.lines === "string" ? JSON.parse(created.order.lines) : created.order.lines },
      });
      if (normalizedOrderPhone) {
        const customer = await customerRepository.recordActivity(asyncDb, { tenantId: l.tenant_id, locationId: l.id, phoneE164: normalizedOrderPhone, source: "order_checkout", marketingConsent: b.whatsappMarketingConsent });
        await asyncDb.run("UPDATE orders SET customer_id=?,customer_phone=? WHERE id=? AND location_id=? AND customer_phone=''", [customer.id, normalizedOrderPhone, created.order.id, l.id]);
      }
      return { ...(await orderRepository.publicView(created.order)), accessToken: created.accessToken };
    },
  );
  app.get("/api/orders/:oid", async (r) => orderRepository.publicView(await orderAccess(r)));
  app.get("/api/public/orders/:token", async (r) => {
    const o = await orderRepository.getByTrackingToken((r.params as any).token);
    if (!o) fail(404, "Order not found");
    return orderRepository.publicView(o);
  });
  app.get("/api/locations/:lid/operations/events", async (r, reply) => {
    const { l, u } = await loc(r);
    const wantsKitchen = hasPermission(u, "orders.kitchen");
    const wantsService = hasPermission(u, "service_requests.view");
    if (!wantsKitchen && !wantsService && !hasPermission(u, "orders.view")) fail(403, "Permission denied");
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    raw.write(`event: ready\ndata: ${JSON.stringify({ tenantId: l.tenant_id, locationId: l.id })}\n\n`);
    const unsubscribe = realtime.subscribe(l.tenant_id, l.id, (event) => {
      if ((event.audience === "kitchen" && !wantsKitchen) || (event.audience === "service" && !wantsService && !hasPermission(u, "orders.view"))) return;
      raw.write(`id: ${event.id}\nevent: ${event.kind}\ndata: ${JSON.stringify(event.data)}\n\n`);
    });
    const heartbeat = setInterval(() => raw.write(": heartbeat\n\n"), 15000);
    r.raw.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });
  app.get("/api/locations/:lid/orders", async (r) => {
    const { l, u } = await loc(r);
    requirePermission(u, "orders.view");
    const orderRows = await orderRepository.list(l.id);
    return {
      orders: await Promise.all(orderRows.map(async (o: any) => ({ ...await orderRepository.view(o), events: await orderRepository.events(o.id) }))),
      serverTime: new Date().toISOString(),
      pollAfterMs: 4000,
    };
  });
  app.get("/api/locations/:lid/orders/:oid", async (r) => {
    const { l, u } = await loc(r);
    requirePermission(u, "orders.view");
    const oid = (r.params as any).oid;
    const order = await orderRepository.getById(oid, l.id);
    if (!order) fail(404, "Order not found");
    const view = await orderRepository.view(order);
    const refunds = await asyncDb.all<any>(
      `SELECT r.id,r.order_item_id,r.amount_paise,r.currency,r.status,r.reason,r.note,r.created_at,r.processed_at,oi.item_name_snapshot
       FROM refunds r LEFT JOIN order_items oi ON oi.id=r.order_item_id
       WHERE r.order_id=? AND r.location_id=? ORDER BY r.created_at ASC`,
      [oid, l.id],
    );
    const refundIds = refunds.map((item: any) => item.id);
    const audit = await asyncDb.all<any>(
      `SELECT action,actor_id,record_id,detail,created_at FROM audit
       WHERE tenant_id=? AND (record_id=?${refundIds.length ? ` OR record_id IN (${refundIds.map(() => "?").join(",")})` : ""})
       ORDER BY created_at ASC`,
      [l.tenant_id, oid, ...refundIds],
    );
    return { ...view, events: await orderRepository.events(oid), refunds, audit };
  });
  app.post("/api/locations/:lid/orders/:oid/state", async (r) => {
    const { l, u } = await loc(r);
    const b = z
      .object({ state: z.string(), expectedState: z.string(), reason: z.string().max(300).default("") })
      .parse(r.body);
    if (["preparing", "ready"].includes(b.state)) requirePermission(u, "orders.kitchen");
    else if (b.state === "served") requirePermission(u, "orders.service");
    else if (b.state === "closed") requirePermission(u, "orders.close");
    else requirePermission(u, "orders.manage");
    const oid = (r.params as any).oid;
    await asyncDb.transaction(async (tx) => {
      const previous = await orderRepository.transition(tx, oid, l.id, b.state, b.expectedState, u.id, b.reason);
      await auditAsync(u.id, l.tenant_id, "order.state", oid, { old: previous.state, new: b.state }, tx);
    });
    const updatedOrder = await orderRepository.getById(oid, l.id);
    realtime.emit({ id: id(), tenantId: l.tenant_id, locationId: l.id, kind: "order.updated", audience: b.state === "served" || b.state === "closed" ? "service" : "kitchen", data: { orderId: oid, state: b.state, servedAt: updatedOrder?.served_at || null, closedAt: updatedOrder?.closed_at || null } });
    if (b.state === "completed") {
      const completed = await orderRepository.getById(oid, l.id);
      if (completed?.customer_id || completed?.customer_phone) {
        await customerRepository.recordCompletedOrder(asyncDb, { tenantId: l.tenant_id, locationId: l.id, customerId: completed.customer_id, phoneE164: completed.customer_phone || undefined, amountPaise: Number(completed.amount_paise || 0) });
        await marketingRepository.recordCompletedOrder({ tenantId: l.tenant_id, locationId: l.id, customerId: completed.customer_id, phoneE164: completed.customer_phone || undefined, amountPaise: Number(completed.amount_paise || 0) });
      }
    }
    return { ok: true };
  });
  app.post("/api/orders/:oid/payments", async (r) => {
    const o = await orderAccess(r);
    if (
      ["rejected", "cancelled", "completed"].includes(o.state) ||
      o.payment_state !== "pending"
    )
      fail(409, "Order is not payable");
    const b = z.object({ idempotencyKey: z.uuid(), customerPhone: z.string().trim().min(1).max(32), whatsappMarketingConsent: z.boolean().default(false) }).parse(r.body);
    const customerPhone = normalizeCustomerPhone(b.customerPhone);
    if (!customerPhone) fail(400, "Enter a valid Indian mobile number", "INVALID_CUSTOMER_PHONE");
    const location = await businessRepository.getLocation(o.location_id);
    if (!location) fail(404, "Location not found");
    const customer = await customerRepository.recordActivity(asyncDb, { tenantId: location.tenant_id, locationId: location.id, phoneE164: customerPhone ?? "", source: "pay_sheet", marketingConsent: b.whatsappMarketingConsent });
    const attempt = await paymentRepository.createAttempt({
      locationId: location.id,
      activeRouteId: location.active_route_id,
      idempotencyKey: b.idempotencyKey,
      orderId: o.id,
      customerPhone: customerPhone ?? undefined,
    });
    await asyncDb.run("UPDATE attempts SET customer_id=? WHERE id=? AND location_id=?", [customer.id, attempt.id, location.id]);
    await asyncDb.run("UPDATE orders SET customer_id=?,customer_phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id=? AND customer_phone=''", [customer.id, customerPhone, o.id, location.id]);
    return attempt;
  });
  app.post("/api/public/:slug/payments", async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const b = z.object({ idempotencyKey: z.uuid(), amountPaise: z.number().int().min(1).max(100000000).optional(), customerPhone: z.string().trim().min(1).max(32), whatsappMarketingConsent: z.boolean().default(false), tableId: z.string().uuid().optional(), tableToken: z.string().max(100).optional() }).parse(r.body);
    const customerPhone = normalizeCustomerPhone(b.customerPhone);
    if (!customerPhone) fail(400, "Enter a valid Indian mobile number", "INVALID_CUSTOMER_PHONE");
    let tableId: string | undefined;
    let orderId: string | undefined;
    if (b.tableId || b.tableToken) {
      if (!b.tableId || !b.tableToken) fail(403, "Table context is invalid");
      const table = await asyncDb.get<any>("SELECT id FROM restaurant_tables WHERE id=? AND location_id=? AND public_token=? AND enabled=TRUE", [b.tableId, l.id, b.tableToken]);
      if (!table) fail(403, "Table context is invalid");
      tableId = table.id;
      const activeOrder = await serviceRequestRepository.activeOrderForTable(table.id, l.id);
      if (!activeOrder) fail(409, "There is no active bill for this table");
      orderId = activeOrder.id;
    }
    const customer = await customerRepository.recordActivity(asyncDb, { tenantId: l.tenant_id, locationId: l.id, phoneE164: customerPhone ?? "", source: "pay_sheet", marketingConsent: b.whatsappMarketingConsent });
    const attempt = await paymentRepository.createAttempt({
      locationId: l.id,
      activeRouteId: l.active_route_id,
      idempotencyKey: b.idempotencyKey,
      orderId,
      amountPaise: b.amountPaise,
      customerPhone: customerPhone ?? undefined,
      tableId,
    });
    await asyncDb.run("UPDATE attempts SET customer_id=? WHERE id=? AND location_id=?", [customer.id, attempt.id, l.id]);
    return attempt;
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
  app.get("/api/locations/:lid/operations-settings", async (r) => {
    const { l, u } = await loc(r, ["owner", "manager", "staff"]);
    requirePermission(u, "orders.view");
    return { cancellationWindowMinutes: Number(l.cancellation_window_minutes ?? 5) };
  });
  app.patch("/api/locations/:lid/operations-settings", async (r) => {
    const { l, u } = await loc(r, ["owner"]);
    const b = z.object({ cancellationWindowMinutes: z.number().int().min(0).max(60) }).parse(r.body);
    await asyncDb.run("UPDATE locations SET cancellation_window_minutes=? WHERE id=? AND tenant_id=?", [b.cancellationWindowMinutes, l.id, l.tenant_id]);
    await auditAsync(u.id, l.tenant_id, "operations.cancellation_window.updated", l.id, b);
    return { cancellationWindowMinutes: b.cancellationWindowMinutes };
  });
  app.post("/api/locations/:lid/orders/:oid/items/:itemId/cancel", async (r) => {
    const { l, u } = await loc(r);
    const b = z.object({ quantity: z.number().int().min(1).max(20), idempotencyKey: z.uuid(), reason: z.enum(["Customer requested", "Ordered by mistake", "Item unavailable", "Customer escalation", "Kitchen issue", "Service recovery", "Other"]), note: z.string().max(300).default(""), override: z.boolean().default(false) }).parse(r.body);
    const privileged = hasPermission(u, "orders.cancel_locked_item");
    const override = b.override && privileged;
    const result = await asyncDb.transaction((tx) => operationsRepository.cancelItem(tx, { id: id(), locationId: l.id, tenantId: l.tenant_id, orderId: (r.params as any).oid, itemId: (r.params as any).itemId, quantity: b.quantity, idempotencyKey: b.idempotencyKey, actorId: u.id, actorRole: u.role, reason: b.reason, note: b.note, override }));
    realtime.emit({ id: id(), tenantId: l.tenant_id, locationId: l.id, kind: "order.updated", audience: "kitchen", data: { orderId: (r.params as any).oid, itemId: (r.params as any).itemId, itemCancelled: true, itemName: result.itemName, tableName: result.tableName, cancelledQuantity: result.cancelledQuantity } });
    return result;
  });
  app.post("/api/locations/:lid/orders/:oid/refunds/:refundId/complete-manual", async (r) => {
    const { l, u } = await loc(r);
    requirePermission(u, "billing.manage");
    const b = z.object({ note: z.string().min(3).max(300) }).parse(r.body);
    const result = await asyncDb.transaction((tx) => operationsRepository.completeManualRefund(tx, { locationId: l.id, orderId: (r.params as any).oid, refundId: (r.params as any).refundId, actorId: u.id, note: b.note }));
    await auditAsync(u.id, l.tenant_id, "refund.manual.completed", (r.params as any).refundId, b);
    return result;
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
  app.post("/api/public/:slug/service-requests", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (r) => {
    const l = await publicLoc((r.params as any).slug);
    const b = z.object({ type: z.enum(["WAITER", "WATER", "CUTLERY", "BILL"]), tableId: z.uuid(), tableToken: z.string().min(16).max(120), quantity: z.number().int().min(1).max(10).default(1) }).parse(r.body);
    const table = await tableRepository.getEnabledByToken(l.id, b.tableToken);
    if (!table || table.id !== b.tableId) fail(403, "Table context is invalid");
    if (b.type === "WATER" && b.quantity > 1 && !(profileSchema.parse(JSON.parse(l.profile)) as any).waterQuantityEnabled) fail(400, "Quantity selection is unavailable");
    const order = await serviceRequestRepository.activeOrderForTable(table.id, l.id);
    if (b.type === "BILL" && !order) fail(409, "There is no active order for this table");
    const requestId = id();
    const created = await asyncDb.transaction((tx) => serviceRequestRepository.createService(tx, { id: requestId, publicToken: publicId(), tenantId: l.tenant_id, locationId: l.id, tableId: table.id, orderId: order?.id, type: b.type, quantity: b.quantity }));
    if (b.type === "BILL" && order) await asyncDb.run("UPDATE orders SET bill_requested_at=COALESCE(bill_requested_at,CURRENT_TIMESTAMP) WHERE id=? AND location_id=?", [order.id, l.id]);
    if (created.created) realtime.emit({ id: id(), tenantId: l.tenant_id, locationId: l.id, kind: "service_request.created", audience: "service", data: { requestId: created.request.id, publicToken: created.request.public_token, type: b.type, quantity: b.quantity, tableName: table.name } });
    return { request: { id: created.request.id, publicToken: created.request.public_token, type: created.request.type, quantity: created.request.quantity, status: created.request.status, tableName: table.name, totalPaise: order ? Number(order.amount_paise) : null }, deduplicated: !created.created };
  });
  app.get("/api/public/service-requests/:token", async (r) => {
    const request = await serviceRequestRepository.getByToken(String((r.params as any).token));
    if (!request) fail(404, "Service request not found");
    return { id: request.id, type: request.type, quantity: Number(request.quantity), status: request.status, acknowledgedAt: request.acknowledged_at, completedAt: request.completed_at };
  });
  app.get("/api/public/service-requests/:token/bill", async (r) => {
    const request = await serviceRequestRepository.getByToken(String((r.params as any).token));
    if (!request || request.type !== "BILL") fail(404, "Bill request not found");
    const order = request.order_id ? await orderRepository.getById(request.order_id, request.location_id) : undefined;
    if (!order) fail(404, "Bill unavailable");
    const view = await orderRepository.publicView(order);
    const refunds = await asyncDb.all<any>("SELECT r.id,r.order_item_id,r.amount_paise,r.currency,r.status,r.reason,r.created_at,r.processed_at,oi.item_name_snapshot FROM refunds r LEFT JOIN order_items oi ON oi.id=r.order_item_id WHERE r.order_id=? AND r.location_id=? ORDER BY r.created_at ASC", [order.id, request.location_id]);
    const refundTotal = refunds.reduce((sum: number, item: any) => sum + Number(item.amount_paise || 0), 0);
    const totalPaise = Number(view.amount_paise);
    return { orderNumber: view.publicOrderNumber, tableName: view.tableName, items: view.lines, subtotalPaise: Math.max(0, totalPaise - Number(view.tax_paise || 0) - Number(view.packaging_fee_paise || 0) - Number(view.service_fee_paise || 0) - Number(view.delivery_fee_paise || 0) + Number(view.discount_paise || 0)), discountPaise: Number(view.discount_paise || 0), taxPaise: Number(view.tax_paise || 0), packagingFeePaise: Number(view.packaging_fee_paise || 0), serviceFeePaise: Number(view.service_fee_paise || 0), deliveryFeePaise: Number(view.delivery_fee_paise || 0), totalPaise, originalPaidPaise: totalPaise + refundTotal, netPaidPaise: totalPaise, refunds, paymentState: view.payment_state };
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
  app.get("/api/locations/:lid/service-requests", async (r) => {
    const { l, u } = await loc(r);
    requirePermission(u, "service_requests.view");
    return { requests: await serviceRequestRepository.listService(l.id) };
  });
  app.post("/api/locations/:lid/service-requests/:rid/acknowledge", async (r) => {
    const { l, u } = await loc(r);
    requirePermission(u, "service_requests.manage");
    const rid = (r.params as any).rid;
    await asyncDb.transaction(async (tx) => { if (!(await serviceRequestRepository.acknowledge(tx, rid, l.id, u.id)).rowCount) fail(409, "Request is no longer available"); await auditAsync(u.id, l.tenant_id, "service_request.acknowledged", rid, {}, tx); });
    realtime.emit({ id: id(), tenantId: l.tenant_id, locationId: l.id, kind: "service_request.updated", audience: "service", data: { requestId: rid, status: "ACKNOWLEDGED" } });
    return { ok: true };
  });
  app.post("/api/locations/:lid/service-requests/:rid/complete", async (r) => {
    const { l, u } = await loc(r);
    requirePermission(u, "service_requests.manage");
    const rid = (r.params as any).rid;
    await asyncDb.transaction(async (tx) => { if (!(await serviceRequestRepository.complete(tx, rid, l.id, u.id)).rowCount) fail(409, "Request is no longer in progress"); await auditAsync(u.id, l.tenant_id, "service_request.completed", rid, {}, tx); });
    realtime.emit({ id: id(), tenantId: l.tenant_id, locationId: l.id, kind: "service_request.updated", audience: "service", data: { requestId: rid, status: "COMPLETED" } });
    return { ok: true };
  });
  app.get("/api/locations/:lid/analytics", async (r) => {
    const { l } = await loc(r, ["owner", "manager"]);
    await paid(l.tenant_id, "analytics");
    return analyticsRepository.list(l.id);
  });
  app.get("/api/locations/:lid/operations/metrics", async (r) => {
    const { l } = await loc(r, ["owner", "manager"]);
    await paid(l.tenant_id, "analytics");
    const q = z.object({ range: z.enum(["today", "yesterday", "7d", "custom"]).default("today"), from: z.iso.datetime().optional() }).parse(r.query);
    const from = q.from || (q.range === "7d" ? new Date(Date.now() - 7 * 86400000).toISOString() : q.range === "yesterday" ? new Date(Date.now() - 2 * 86400000).toISOString() : new Date(new Date().setHours(q.range === "today" ? 0 : 0, 0, 0, 0)).toISOString());
    return operationsRepository.metrics(l.id, from);
  });
  app.get("/api/locations/:lid/audit", async (r) => {
    const { l } = await loc(r, ["owner"]);
    return adminRepository.auditList(l.tenant_id);
  });
  app.get("/api/tenants/:tid/staff", async (r) => {
    const tid = (r.params as any).tid;
    const u = await membership(r, tid, ["owner", "manager"]);
    requirePermission(u, "staff.manage");
    return staffRepository.list(tid);
  });
  app.get("/api/tenants/:tid/staff/invitations", async (r) => {
    const tid = (r.params as any).tid;
    const u = await membership(r, tid, ["owner", "manager"]);
    requirePermission(u, "staff.manage");
    return staffRepository.listInvitations(tid);
  });
  app.post("/api/tenants/:tid/staff/invitations", async (r) => {
    const tid = (r.params as any).tid,
      u = await membership(r, tid, ["owner", "manager"]);
    requirePermission(u, "staff.manage");
    const t = await paid(tid, "staff");
    const b = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.email().transform((s) => s.toLowerCase()),
      role: z.enum(["manager", "staff"]),
      operationalRole: z.enum(["manager", "kitchen", "service", "cashier"]).default("service"),
      permissions: z.record(z.string().max(60), z.boolean()).default({}),
      locationId: z.string().uuid().nullable().optional(),
    }).parse(r.body);
    const existing = await staffRepository.findUserByEmail(b.email);
    if (existing && (await staffRepository.membership(existing.id, tid)))
      fail(409, "This person is already part of the business");
    if (b.locationId) {
      const location = await businessRepository.getLocation(b.locationId);
      if (!location || location.tenant_id !== tid) fail(403, "Location does not belong to this business");
    }
    const token = secret(), expires = new Date(Date.now() + 72 * 3600000).toISOString(), invitationId = id();
    await asyncDb.transaction(async (tx) => {
      // Touch the tenant row inside the transaction so concurrent invitations
      // serialize before the seat count is checked.
      await tx.run("UPDATE tenants SET name=name WHERE id=?", [tid]);
      if (Number((await tx.get<{ n: number }>("SELECT count(*) n FROM memberships WHERE tenant_id=? AND role!='owner'", [tid]))?.n ?? 0) >= t.entitlements.staff)
        fail(402, "Prime includes up to 5 staff accounts.", "STAFF_LIMIT_REACHED");
      await tx.run("INSERT INTO staff_invitations(id,tenant_id,location_id,email,name,role,operational_role,permissions,token_hash,expires_at,invited_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [invitationId, tid, b.locationId || null, b.email, b.name, b.role, b.operationalRole, JSON.stringify(b.permissions), hash(token), expires, u.id]);
      await auditAsync(u.id, tid, "staff.invited", invitationId, { email: b.email, role: b.role }, tx);
    });
    await sendMail(b.email, `You're invited to join ${t.name} on 1QR Prime`, `${u.email} invited you to join ${t.name}.\n\nRole: ${b.role}\nThis invitation expires in 72 hours.\n\nAccept invitation: ${c.PUBLIC_ORIGIN}/staff/invite/${token}\n\nIf you did not expect this invitation, you can ignore it.`);
    return { ok: true, invitationId, status: "pending" };
  });
  app.get("/api/staff/invitations/:token", async (r) => {
    const token = String((r.params as any).token);
    if (!/^[a-f0-9]{64}$/.test(token)) fail(400, "Invalid invitation");
    const invitation = await staffRepository.invitation(hash(token));
    if (!invitation || invitation.revoked_at || invitation.accepted_at || new Date(invitation.expires_at).getTime() <= Date.now())
      fail(400, "Invitation expired or unavailable");
    return { email: invitation.email, name: invitation.name, role: invitation.role, operationalRole: invitation.operational_role || "service", expiresAt: invitation.expires_at };
  });
  app.post("/api/staff/invitations/:token/accept", async (r, reply) => {
    const token = String((r.params as any).token);
    if (!/^[a-f0-9]{64}$/.test(token)) fail(400, "Invalid invitation");
    const invitation = await staffRepository.invitation(hash(token));
    if (!invitation || invitation.revoked_at || invitation.accepted_at || new Date(invitation.expires_at).getTime() <= Date.now())
      fail(400, "Invitation expired or unavailable");
    const b = z.object({ password: z.string().min(12).max(128), name: z.string().trim().min(2).max(100).optional() }).parse(r.body);
    const existing = await staffRepository.findUserByEmail(invitation.email);
    let actor = existing;
    if (existing) {
      const tokenFromRequest = r.headers.authorization?.replace(/^Bearer /, "") || r.cookies.session;
      actor = tokenFromRequest ? await authRepository.findUserBySession(hash(tokenFromRequest), Date.now()) : undefined;
      if (!actor || actor.id !== existing.id) fail(403, "Sign in with the invited email to accept this invitation");
    } else {
      const argon2 = await import("argon2");
      actor = { id: id(), email: invitation.email, password: await argon2.hash(b.password) };
    }
    await asyncDb.transaction(async (tx) => {
      await tx.run("UPDATE tenants SET name=name WHERE id=?", [invitation.tenant_id]);
      const existingMembership = await tx.get<{ role: string }>("SELECT role FROM memberships WHERE user_id=? AND tenant_id=?", [actor.id, invitation.tenant_id]);
      if (existingMembership) fail(409, "This person is already part of the business");
      const plan = await tx.get<{ entitlements: string }>("SELECT p.entitlements FROM tenants t JOIN plans p ON p.id=t.plan_id WHERE t.id=?", [invitation.tenant_id]);
      const maxStaff = Number(JSON.parse(plan?.entitlements || "{}").staff || 0);
      if (Number((await tx.get<{ n: number }>("SELECT count(*) n FROM memberships WHERE tenant_id=? AND role!='owner'", [invitation.tenant_id]))?.n ?? 0) >= maxStaff)
        fail(402, "Prime includes up to 5 staff accounts.", "STAFF_LIMIT_REACHED");
      if (!existing) await tx.run("INSERT INTO users(id,email,password) VALUES (?,?,?)", [actor.id, actor.email, actor.password]);
      await tx.run("INSERT INTO memberships(user_id,tenant_id,role,operational_role,permissions) VALUES (?,?,?,?,?) ON CONFLICT(user_id,tenant_id) DO UPDATE SET role=excluded.role,operational_role=excluded.operational_role,permissions=excluded.permissions", [actor.id, invitation.tenant_id, invitation.role, invitation.operational_role || "service", invitation.permissions || "{}"]);
      await tx.run("UPDATE staff_invitations SET accepted_at=?,updated_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL", [new Date().toISOString(), new Date().toISOString(), invitation.id]);
      await auditAsync(actor.id, invitation.tenant_id, "staff.invitation.accepted", invitation.id, { role: invitation.role }, tx);
    });
    if (!existing) return await newSession(actor.id, r, reply);
    return { ok: true, status: "accepted" };
  });
  app.post("/api/tenants/:tid/staff/invitations/:iid/revoke", async (r) => {
    const tid = (r.params as any).tid, u = await membership(r, tid, ["owner", "manager"]);
    requirePermission(u, "staff.manage");
    const iid = (r.params as any).iid;
    await asyncDb.transaction(async (tx) => {
      if (!(await tx.run("UPDATE staff_invitations SET revoked_at=?,updated_at=? WHERE id=? AND tenant_id=? AND accepted_at IS NULL AND revoked_at IS NULL", [new Date().toISOString(), new Date().toISOString(), iid, tid])).rowCount) fail(404, "Invitation not found");
      await auditAsync(u.id, tid, "staff.invitation.revoked", iid, {}, tx);
    });
    return { ok: true };
  });
  app.post("/api/tenants/:tid/staff", async (r) => {
    const tid = (r.params as any).tid,
      u = await membership(r, tid, ["owner", "manager"]);
    requirePermission(u, "staff.manage");
    const t = await paid(tid, "staff");
    const b = z
      .object({
        email: z.email().transform((s) => s.toLowerCase()),
        role: z.enum(["manager", "staff"]),
        operationalRole: z.enum(["manager", "kitchen", "service", "cashier"]).default("service"),
        permissions: z.record(z.string().max(60), z.boolean()).default({}),
      })
      .parse(r.body);
    const target = await staffRepository.findUserByEmail(b.email);
    if (!target) fail(404, "Staff must register an account first");
    const current = await staffRepository.membership(target.id, tid);
    if (current?.role === "owner")
      fail(409, "Ownership cannot be changed here");
    await asyncDb.transaction(async (tx) => {
      if (!current) {
        await tx.run("UPDATE tenants SET name=name WHERE id=?", [tid]);
        if (Number((await tx.get<{ n: number }>("SELECT count(*) n FROM memberships WHERE tenant_id=? AND role!='owner'", [tid]))?.n ?? 0) >= t.entitlements.staff)
          fail(402, "Prime includes up to 5 staff accounts.", "STAFF_LIMIT_REACHED");
      }
      await staffRepository.upsert(tx, target.id, tid, b.role, b.operationalRole, JSON.stringify(b.permissions));
      await auditAsync(u.id, tid, "staff.updated", target.id, b, tx);
    });
    return { ok: true };
  });
  app.delete("/api/tenants/:tid/staff/:uid", async (r) => {
    const tid = (r.params as any).tid,
      u = await membership(r, tid, ["owner", "manager"]);
    requirePermission(u, "staff.manage");
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
  app.get("/api/admin/sales-leads", async (r) => {
    await admin(r);
    const status = z.enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"]).optional().parse((r.query as any)?.status);
    return adminRepository.salesLeads(status);
  });
  app.get("/api/admin/sales-leads/:id", async (r) => {
    await admin(r);
    const lead = await adminRepository.salesLead((r.params as any).id);
    if (!lead) fail(404, "Sales lead not found");
    return lead;
  });
  app.get("/api/admin/billing-payments", async (r) => {
    await admin(r);
    const query = z.object({
      status: z.enum(["CREATED", "VERIFIED", "FAILED", "CANCELLED"]).optional(),
      q: z.string().trim().max(100).optional(),
    }).parse(r.query);
    return adminRepository.billingPayments({ status: query.status, query: query.q });
  });
  app.get("/api/admin/marketing/overview", async (r) => {
    await admin(r);
    return adminRepository.marketingOverview();
  });
  app.patch("/api/admin/sales-leads/:id", async (r) => {
    const u = await admin(r, true);
    const leadId = (r.params as any).id;
    const b = z.object({ status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"]), notes: z.string().max(2000).nullable().optional() }).parse(r.body);
    await asyncDb.transaction(async (tx) => {
      if (!(await adminRepository.updateSalesLead(tx, leadId, b.status, b.notes ?? null)).rowCount) fail(404, "Sales lead not found");
      await auditAsync(u.id, null, "sales.lead.updated", leadId, { status: b.status });
    });
    return { ok: true, status: b.status };
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
    const [tenant, locations, staff, loginHistory, billingPayments] = await adminRepository.accountDetail(tid);
    return {
      tenant,
      locations: locations.map((location) => ({ ...location, profile: undefined })),
      staff: staff.map((member) => ({ ...member, permissions: typeof member.permissions === "string" ? JSON.parse(member.permissions || "{}") : {} })),
      loginHistory,
      billingPayments,
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
