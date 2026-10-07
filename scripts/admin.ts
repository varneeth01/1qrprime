import { openDb } from "../apps/api/src/db.js";
import { randomUUID } from "node:crypto";
const [email, role] = process.argv.slice(2);
if (!email || !["support", "admin", "none"].includes(role)) {
  console.error(
    "Usage: DATABASE_PATH=... npx tsx scripts/admin.ts registered-email support|admin|none",
  );
  process.exit(1);
}
const db = openDb(process.env.DATABASE_PATH || "apps/api/data/prime.sqlite");
const u = db
  .prepare("SELECT id FROM users WHERE email=?")
  .get(email.toLowerCase()) as any;
if (!u) throw Error("User must register first");
db.transaction(() => {
  db.prepare("UPDATE users SET admin_role=? WHERE id=?").run(
    role === "none" ? null : role,
    u.id,
  );
  db.prepare(
    "INSERT INTO audit(id,actor_id,action,record_id,detail) VALUES (?,?,?,?,?)",
  ).run(
    randomUUID(),
    "operator-cli",
    "admin.role",
    u.id,
    JSON.stringify({ role }),
  );
})();
db.close();
console.log("Role updated and audited.");
