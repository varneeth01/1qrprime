import { config } from "./config.js";
import { createPostgresDatabase } from "./async-db.js";
import type { Db } from "./db.js";
import { createApp } from "./app.js";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const c = config();
const postgres =
  c.DATABASE_DRIVER === "postgres"
    ? createPostgresDatabase(c.DATABASE_URL)
    : undefined;

let db: Db | undefined;
if (!postgres) {
  // Keep the native SQLite module completely out of the production
  // PostgreSQL/Vercel runtime. A static import of db.ts loads
  // better-sqlite3 even when SQLite is never selected.
  const { openDb } = await import("./db.js");
  db = openDb(c.DATABASE_PATH);
}

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

await app.listen({ port: c.PORT, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    if (postgres) await postgres.close();
    else db?.close();
    process.exit(0);
  });
