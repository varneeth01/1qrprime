import { config } from "./config.js";
import { openDb, type Db } from "./db.js";
import { createPostgresDatabase } from "./async-db.js";
import { createApp } from "./app.js";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const c = config();
const postgres = c.DATABASE_DRIVER === "postgres" ? createPostgresDatabase(c.DATABASE_URL) : undefined;
const db = postgres ? undefined : openDb(c.DATABASE_PATH);
const app = await createApp((db as Db | undefined) as Db, c, postgres);
const web = fileURLToPath(new URL("../../web/dist/", import.meta.url));
if (existsSync(web)) {
  await app.register(fastifyStatic, { root: web });
  app.setNotFoundHandler((r, reply) =>
    r.url.startsWith("/api/") ? reply.code(404).send({ error: "Not found" }) : reply.sendFile("index.html"),
  );
}
await app.listen({ port: c.PORT, host: "0.0.0.0" });
