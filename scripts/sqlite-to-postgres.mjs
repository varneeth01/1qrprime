import Database from "better-sqlite3";
import { Pool } from "pg";

const sourcePath = process.env.SOURCE_SQLITE_PATH;
const connectionString = process.env.DIRECT_URL;
if (!sourcePath) throw new Error("SOURCE_SQLITE_PATH is required");
if (!connectionString) throw new Error("DIRECT_URL is required");
if (process.env.CONFIRM_MIGRATION !== "YES") throw new Error("Refusing migration: set CONFIRM_MIGRATION=YES");

const sqlite = new Database(sourcePath, { readonly: true });
const pool = new Pool({ connectionString, max: 2 });
const client = await pool.connect();
const order = ["plans", "users", "tenants", "memberships", "sessions", "email_tokens", "locations", "menu_categories", "items", "modifier_groups", "modifiers", "menu_item_modifier_groups", "menu_item_variants", "restaurant_tables", "routes", "order_sequences", "orders", "order_events", "order_items", "order_item_modifiers", "events", "outbox", "attempts", "requests", "push_tokens", "reports", "support_notes", "audit"];
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const sqliteTables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name));
const targetTables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'schema_migrations'")).rows.map((r) => r.table_name);

try {
  await client.query("BEGIN");
  for (const table of targetTables) {
    const count = Number((await client.query(`SELECT count(*)::bigint AS count FROM ${quote(table)}`)).rows[0].count);
    if (table === "plans" && count <= 2) {
      const seeded = (await client.query("SELECT id FROM plans")).rows.map((row) => row.id);
      if (seeded.every((id) => id === "starter" || id === "prime")) continue;
    }
    if (count !== 0) throw new Error(`Destination is not empty: ${table} has ${count} rows`);
  }
  for (const table of order) {
    if (!sqliteTables.has(table) || !targetTables.includes(table)) continue;
    const sourceColumns = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all().map((r) => r.name);
    const targetColumns = (await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows;
    const columns = targetColumns.filter((c) => sourceColumns.includes(c.column_name));
    const rows = sqlite.prepare(`SELECT ${sourceColumns.map(quote).join(",")} FROM ${quote(table)}`).all();
    if (columns.length && rows.length) {
      const insert = `INSERT INTO ${quote(table)} (${columns.map((c) => quote(c.column_name)).join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT DO NOTHING`;
      const booleans = new Set(columns.filter((c) => c.data_type === "boolean").map((c) => c.column_name));
      for (const row of rows) await client.query(insert, columns.map((c) => booleans.has(c.column_name) && row[c.column_name] !== null ? Boolean(row[c.column_name]) : row[c.column_name]));
    }
    const count = Number((await client.query(`SELECT count(*)::bigint AS count FROM ${quote(table)}`)).rows[0].count);
    if (count !== rows.length) throw new Error(`Row-count mismatch for ${table}: source=${rows.length}, destination=${count}`);
    console.log(`${table}: ${rows.length} -> ${count}`);
  }
  for (const [table, column] of [["locations", "public_id"], ["restaurant_tables", "public_token"], ["orders", "customer_tracking_token"], ["orders", "public_order_number"], ["attempts", "id"]]) {
    if (!sqliteTables.has(table) || !targetTables.includes(table)) continue;
    const source = sqlite.prepare(`SELECT ${quote(column)} AS value FROM ${quote(table)} WHERE ${quote(column)} IS NOT NULL ORDER BY ${quote(column)}`).all().map((r) => r.value);
    const target = (await client.query(`SELECT ${quote(column)} AS value FROM ${quote(table)} WHERE ${quote(column)} IS NOT NULL ORDER BY ${quote(column)}`)).rows.map((r) => r.value);
    if (JSON.stringify(source) !== JSON.stringify(target)) throw new Error(`Identity mismatch for ${table}.${column}`);
    console.log(`${table}.${column}: preserved (${source.length})`);
  }
  await client.query("COMMIT");
  console.log("SQLite to PostgreSQL migration completed");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
  sqlite.close();
}
