import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const positiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const maxWaitMs = positiveInt(process.env.PG_MIGRATION_MAX_WAIT_MS, 120_000);
const connectTimeoutMs = positiveInt(process.env.PG_MIGRATION_CONNECT_TIMEOUT_MS, 5_000);
const maxBackoffMs = positiveInt(process.env.PG_MIGRATION_MAX_BACKOFF_MS, 5_000);
const migrationLockId = 19_012_026;
const ssl =
  process.env.DATABASE_SSL && process.env.DATABASE_SSL !== "disable"
    ? { rejectUnauthorized: process.env.DATABASE_SSL === "verify-full" }
    : undefined;

const pool = new Pool({
  connectionString,
  max: 2,
  connectionTimeoutMillis: connectTimeoutMs,
  ssl,
});

const errorCode = (error) =>
  error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";

async function connectWithRetry() {
  const startedAt = Date.now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await pool.connect();
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= maxWaitMs) {
        console.error(
          `PostgreSQL migration connection failed after ${attempt} attempts (code ${errorCode(error)})`,
        );
        throw error;
      }

      const exponentialMs = Math.min(maxBackoffMs, 500 * 2 ** Math.min(attempt - 1, 4));
      const waitMs = Math.max(100, Math.min(exponentialMs, maxWaitMs - elapsedMs));
      console.warn(
        `PostgreSQL not ready for migrations (attempt ${attempt}, code ${errorCode(error)}); retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }
}

const client = await connectWithRetry();
let lockHeld = false;

try {
  // Multiple API replicas may start at once. Serialize migrations so only one
  // process can apply a migration while the others wait and then re-check.
  await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
  lockHeld = true;

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const directory = fileURLToPath(new URL("../apps/api/migrations/postgres/", import.meta.url));
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();

  for (const name of files) {
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]);
    if (applied.rowCount) continue;

    const sql = await readFile(join(directory, name), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log("PostgreSQL migrations are up to date");
} finally {
  if (lockHeld) {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
    } catch (error) {
      console.warn(`Could not explicitly release migration advisory lock (code ${errorCode(error)})`);
    }
  }
  client.release();
  await pool.end();
}
