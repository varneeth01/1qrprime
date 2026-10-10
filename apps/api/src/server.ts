import Fastify from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { config } from "./config.js";
import type { Db } from "./db.js";

function loadLocalEnv() {
  if (process.env.NODE_ENV === "production") return;
  const path = process.env.DOTENV_PATH || "../../.env";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

loadLocalEnv();
const c = config();
const app = Fastify({
  logger: c.NODE_ENV !== "test",
  bodyLimit: 1048576,
  // In VPS/Docker production, requests arrive through Coolify's reverse proxy.
  // Trust proxy headers there so rate limiting and client IPs work correctly.
  trustProxy: c.NODE_ENV === "production" && !process.env.VERCEL,
});

let bootstrapStage = "database";

async function start() {
  let postgres: Awaited<ReturnType<typeof import("./async-db.js")["createPostgresDatabase"]>> | undefined;
  let db: Db | undefined;

  try {
    const { createPostgresDatabase } = await import("./async-db.js");
    postgres =
      c.DATABASE_DRIVER === "postgres"
        ? createPostgresDatabase(c.DATABASE_URL)
        : undefined;

    if (!postgres) {
      const { openDb } = await import("./db.js");
      db = openDb(c.DATABASE_PATH);
    }

    bootstrapStage = "application";
    const { createApp } = await import("./app.js");
    await createApp(db as Db, c, postgres, app);

    bootstrapStage = "listen";
    const listening = app.listen({
      // Use the validated configuration so local web proxy and deployed
      // process configuration cannot silently disagree about the API port.
      port: c.PORT,
      ...(process.env.VERCEL
        ? {}
        : { host: process.env.HOST || "0.0.0.0" }),
    });

    await listening;

    if (!process.env.VERCEL) {
      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, async () => {
          await app.close();
          if (postgres) await postgres.close();
          else db?.close();
          process.exit(0);
        });
      }
    }
  } catch (error) {
    console.error(
      {
        bootstrapStage,
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_DRIVER: process.env.DATABASE_DRIVER,
        STORAGE_DRIVER: process.env.STORAGE_DRIVER,
        PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
        API_PUBLIC_ORIGIN: process.env.API_PUBLIC_ORIGIN,
        ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
        error,
      },
      "1QR API bootstrap failed",
    );
    throw error;
  }
}

void start();
