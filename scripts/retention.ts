import { openDb } from "../apps/api/src/db.js";
import { randomUUID } from "node:crypto";
const db = openDb(process.env.DATABASE_PATH || "apps/api/data/prime.sqlite");
// Retention is an explicit privileged job. No public API can mutate audit history.
db.transaction(() => {
  db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
  db.prepare("DELETE FROM email_tokens WHERE expires_at<?").run(Date.now());
  db.prepare(
    "DELETE FROM requests WHERE created_at<datetime('now','-90 days') AND state='closed'",
  ).run();
  db.prepare(
    "DELETE FROM orders WHERE created_at<datetime('now','-90 days') AND state IN ('completed','cancelled','rejected')",
  ).run();
  db.prepare(
    "DELETE FROM attempts WHERE order_id IS NULL AND created_at<datetime('now','-90 days')",
  ).run();
  db.prepare("DELETE FROM events WHERE day<date('now','-13 months')").run();
  db.prepare(
    "DELETE FROM outbox WHERE created_at<datetime('now','-30 days')",
  ).run();
  db.exec("DROP TRIGGER audit_no_delete");
  const result = db
    .prepare("DELETE FROM audit WHERE created_at<datetime('now','-365 days')")
    .run();
  db.exec(
    "CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit immutable'); END;",
  );
  db.prepare(
    "INSERT INTO audit(id,actor_id,action,record_id,detail) VALUES (?,?,?,?,?)",
  ).run(
    randomUUID(),
    "retention-job",
    "retention.executed",
    "system",
    JSON.stringify({ expiredAuditRows: result.changes }),
  );
})();
db.close();
console.log(
  "Retention applied. Unresolved orders/requests retained for operational review.",
);
