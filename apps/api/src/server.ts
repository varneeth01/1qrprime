import Fastify from "fastify";
import { config } from "./config.js";
import type { Db } from "./db.js";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// Vercel's Node backend detector requires the framework to be imported by the
// recognized entrypoint. createApp() owns the Fastify construction, so this
// direct import intentionally keeps framework detection explicit.
void Fastify;

let bootstrapStage = "configuration";

async function bootstrap() {
  try {
    const c = config();

    bootstrapStage = "database";
    const { createPostgresDatabase } = await import("./async-db.js");
    const postgres =
      c.DATABASE_DRIVER === "postgres"
        ? createPostgresDatabase(c.DATABASE_URL)
        : undefined;

    let db: Db | undefined;
    if (!postgres) {
      const { openDb } = await import("./db.js");
      db = openDb(c.DATABASE_PATH);
    }

    bootstrapStage = "application";
    const [{ createApp }, { default: fastifyStatic }] = await Promise.all([
      import("./app.js"),
      import("@fastify/static"),
    ]);
    const app = await createApp(db as Db, c, postgres);
    const web = fileURLToPath(new URL("../../web/dist/", import.meta.url));

    if (existsSync(web)) {
      await app.register(fastifyStatic, { root: web });
      app.setNotFoundHandler((r, reply) =>
        r.url.startsWith("/api/")
          ? reply.code(404).send({ error: "Not found" })
          : reply.sendFile("index.html"),
      );
    }

    await app.ready();

    // Vercel natively wraps the exported Fastify instance as a Function. Do
    // not open a second listener inside the Vercel runtime. Local/dev execution
    // keeps the normal HTTP listener.
    if (!process.env.VERCEL) {
      bootstrapStage = "listen";
      await app.listen({ port: c.PORT, host: "0.0.0.0" });

      for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, async () => {
          await app.close();
          if (postgres) await postgres.close();
          else db?.close();
          process.exit(0);
        });
    }

    return app;
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

const app = await bootstrap();

export default app;
