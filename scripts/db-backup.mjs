import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for PostgreSQL backups");
if (!url.startsWith("postgres://") && !url.startsWith("postgresql://"))
  throw new Error("DATABASE_URL must be a PostgreSQL URL");
const output = process.env.BACKUP_FILE || `backups/prime-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.dump`;
await mkdir(new URL("../", import.meta.url).pathname + "backups", { recursive: true });
await new Promise((resolve, reject) => {
  const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--file", output, url], { stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump exited with ${code}`)));
});
console.log(`PostgreSQL backup written to ${output}`);
