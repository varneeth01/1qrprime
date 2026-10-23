import { spawnSync } from "node:child_process";

const connectionString = process.env.POSTGRES_TEST_URL;
if (!connectionString) {
  console.log("PostgreSQL tests skipped: set POSTGRES_TEST_URL to a disposable local PostgreSQL database.");
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(connectionString);
} catch {
  console.error("POSTGRES_TEST_URL must be a valid PostgreSQL URL.");
  process.exit(2);
}

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);
if (!allowedHosts.has(parsed.hostname)) {
  console.error("Refusing PostgreSQL tests: POSTGRES_TEST_URL must target a disposable local database host.");
  process.exit(2);
}

const migrated = spawnSync("node", ["scripts/postgres-migrate.mjs"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: connectionString },
});
if (migrated.status !== 0) process.exit(migrated.status ?? 2);

const tests = spawnSync("npm", ["test"], {
  stdio: "inherit",
  env: { ...process.env, POSTGRES_TEST_URL: connectionString },
});
process.exit(tests.status ?? 2);
