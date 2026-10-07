import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../src/db.js";
import { createSqliteDatabase } from "../src/async-db.js";

test("SQLite async adapter supports reads, writes and commit", async () => {
  const raw = openDb(":memory:");
  raw.exec("CREATE TABLE async_probe(id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const db = createSqliteDatabase(raw);
  await db.run("INSERT INTO async_probe(id,value) VALUES (?,?)", ["a", "one"]);
  assert.deepEqual(await db.get("SELECT * FROM async_probe WHERE id=?", ["a"]), { id: "a", value: "one" });
  assert.equal((await db.all("SELECT * FROM async_probe")).length, 1);
  await db.transaction(async (tx) => {
    await tx.run("INSERT INTO async_probe(id,value) VALUES (?,?)", ["b", "two"]);
  });
  assert.equal((await db.all("SELECT * FROM async_probe")).length, 2);
  await db.close();
});

test("SQLite async adapter rolls back failed transactions", async () => {
  const raw = openDb(":memory:");
  raw.exec("CREATE TABLE async_probe(id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const db = createSqliteDatabase(raw);
  await assert.rejects(() => db.transaction(async (tx) => {
    await tx.run("INSERT INTO async_probe(id,value) VALUES (?,?)", ["a", "one"]);
    throw new Error("forced rollback");
  }), /forced rollback/);
  assert.equal((await db.all("SELECT * FROM async_probe")).length, 0);
  await db.close();
});
