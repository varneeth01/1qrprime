import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "../src/db.js";

const runtime = (async () => {
  const [{ config }, { createPostgresDatabase }, { createApp }] = await Promise.all([
    import("../src/config.js"),
    import("../src/async-db.js"),
    import("../src/app.js"),
  ]);
  const c = config();
  const postgres = c.DATABASE_DRIVER === "postgres" ? createPostgresDatabase(c.DATABASE_URL) : undefined;
  let db: Db | undefined;
  if (!postgres) {
    const { openDb } = await import("../src/db.js");
    db = openDb(c.DATABASE_PATH);
  }
  const app = await createApp(db as Db, c, postgres);
  await app.ready();
  return app;
})();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await runtime;
    app.routing(req, res);
  } catch (error) {
    console.error("1QR API function bootstrap failed", error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    if (!res.writableEnded) res.end(JSON.stringify({ error: "Service unavailable" }));
  }
}
