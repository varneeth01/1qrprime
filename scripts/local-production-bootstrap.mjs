import { existsSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.DIAGNOSTIC_PORT || 3900);
let stage = "config";
let database;
let app;

function safeConfig() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_DRIVER: process.env.DATABASE_DRIVER,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    API_PUBLIC_ORIGIN: process.env.API_PUBLIC_ORIGIN,
    ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
  };
}

try {
  stage = "config";
  const { config } = await import("../apps/api/dist/config.js");
  const c = config();

  stage = "postgres";
  const { createPostgresDatabase } = await import("../apps/api/dist/async-db.js");
  database = c.DATABASE_DRIVER === "postgres" ? createPostgresDatabase(c.DATABASE_URL) : undefined;
  if (!database) {
    throw new Error("Diagnostic requires DATABASE_DRIVER=postgres");
  }
  await database.get("SELECT 1 AS ok");

  stage = "app";
  const { createApp } = await import("../apps/api/dist/app.js");
  app = await createApp(undefined, c, database);

  stage = "ready";
  await app.ready();

  stage = "listen";
  await app.listen({ port, host: "127.0.0.1" });
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  const ready = await fetch(`http://127.0.0.1:${port}/api/ready`);
  const healthBody = await health.json();
  const readyBody = await ready.json();
  console.log(JSON.stringify({
    ok: health.ok && ready.ok && healthBody.ok === true && readyBody.ok === true && readyBody.database === true,
    stage,
    health: { status: health.status, body: healthBody },
    ready: { status: ready.status, body: readyBody },
    config: safeConfig(),
    webDistPresent: existsSync("apps/web/dist"),
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage,
    config: safeConfig(),
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  if (database) await database.close().catch(() => {});
}
