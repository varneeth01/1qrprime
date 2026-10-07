import { spawn } from "node:child_process";
import process from "node:process";

const url = process.env.DATABASE_URL;
const file = process.env.BACKUP_FILE;
if (!url || !file) throw new Error("DATABASE_URL and BACKUP_FILE are required for restore");
if (process.env.CONFIRM_RESTORE !== "YES") throw new Error("Restore is destructive. Set CONFIRM_RESTORE=YES explicitly.");
await new Promise((resolve, reject) => {
  const child = spawn("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", url, file], { stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`pg_restore exited with ${code}`)));
});
console.log(`PostgreSQL restore completed from ${file}`);
