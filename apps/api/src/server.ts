import Fastify from "fastify";
import { config } from "./config.js";
import type { Db } from "./db.js";

const c = config();
const app = Fastify({
  logger: c.NODE_ENV !== "test",
  bodyLimit: 1048576,
  trustProxy: false,
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
      port: Number(process.env.PORT || 3000),
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
