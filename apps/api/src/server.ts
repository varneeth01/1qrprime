import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import type { Db } from "./db.js";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

let bootstrapStage = "configuration";
let app: FastifyInstance;

try {
  const c = config();

  // Keep the framework import and construction in the recognized entrypoint.
  // Vercel's native Node backend detector requires the entrypoint itself to
  // import the framework; exporting the Fastify instance is the preferred
  // serverless model.
  const fastify = Fastify({
    logger: c.NODE_ENV !== "test",
    bodyLimit: 1048576,
    trustProxy: false,
  });

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
  app = await createApp(db as Db, c, postgres, fastify);
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

  // Vercel wraps the exported Fastify instance as the production Function.
  // Local/dev execution still uses the normal listener.
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

export default app;
