import Database from "better-sqlite3";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function openDb(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  );
  const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
  for (const name of readdirSync(dir).sort())
    if (
      name.endsWith(".sql") &&
      !db.prepare("SELECT 1 FROM migrations WHERE name=?").get(name)
    )
      db.transaction(() => {
        db.exec(readFileSync(resolve(dir, name), "utf8"));
        db.prepare("INSERT INTO migrations(name) VALUES (?)").run(name);
      })();
  return db;
}
export type Db = ReturnType<typeof openDb>;
