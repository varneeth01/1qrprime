import Fastify from "fastify";
import { config } from "./config.js";
import type { Db } from "./db.js";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

let bootstrapStage = "configuration";

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

  bootstrapStage = "listen";
  await app.listen({ port: c.PORT, host: "0.0.0.0" });

  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await app.close();
      if (postgres) await postgres.close();
      else db?.close();
      process.exit(0);
    });
} catch (error) {
  console.error({ err: error, bootstrapStage }, "1QR API bootstrap failed");

  // Fail closed while keeping health/readiness observable. No product routes
  // are exposed when bootstrap fails.
  const fallback = Fastify({ logger: true });
  fallback.get("/api/health", async (_request, reply) =>
    reply.code(503).send({ ok: false, bootstrap: false, stage: bootstrapStage }),
  );
  fallback.get("/api/ready", async (_request, reply) =>
    reply.code(503).send({
      ok: false,
      database: false,
      bootstrap: false,
      stage: bootstrapStage,
    }),
  );
  fallback.setNotFoundHandler((_request, reply) =>
    reply.code(503).send({ error: "Service unavailable", stage: bootstrapStage }),
  );
  await fallback.listen({
    port: Number(process.env.PORT || 3001),
    host: "0.0.0.0",
  });
}
