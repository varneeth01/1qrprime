import Fastify from "fastify";
import { config } from "./config.js";
import type { Db } from "./db.js";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

let bootstrapStage = "configuration";

try {
  const c = config();

  // Vercel's native Fastify detector expects the recognized entrypoint to
  // import and construct Fastify directly.
  const app = Fastify({
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
  await createApp(db as Db, c, postgres, app);

  const web = fileURLToPath(new URL("../../web/dist/", import.meta.url));
  if (existsSync(web)) {
    await app.register(fastifyStatic, { root: web });
    app.setNotFoundHandler((r, reply) =>
      r.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Not found" })
        : reply.sendFile("index.html"),
    );
  }

  bootstrapStage = "listen";
  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: "0.0.0.0",
  });

  if (!process.env.VERCEL) {
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
