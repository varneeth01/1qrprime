import { openDb } from "../apps/api/src/db.js";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const db = openDb(process.env.DATABASE_PATH || "apps/api/data/prime.sqlite");
const dir = process.env.BACKUP_DIR || "artifacts/backups";
await mkdir(dir, { recursive: true, mode: 0o700 });
const path = resolve(
  dir,
  `prime-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
await db.backup(path);
db.close();
console.log(path);
