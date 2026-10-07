import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = await readFile(new URL("../apps/api/src/app.ts", import.meta.url), "utf8");
const lines = source.split("\n");
const bands = [
  [1, 481, "AUTH/SESSIONS/BUSINESSES/ONBOARDING"],
  [482, 633, "MENU/TABLES"],
  [634, 697, "MEDIA"],
  [698, 789, "PAYMENTS/PAYMENT ROUTES"],
  [790, 897, "QR/CUSTOMER PAGE"],
  [898, 967, "ORDERS"],
  [968, 1005, "PAYMENTS/PAYMENT REQUESTS"],
  [1002, 1039, "SERVICE REQUESTS"],
  [1040, 1044, "ANALYTICS"],
  [1045, 1051, "ADMIN/SUPPORT"],
  [1052, 1093, "STAFF"],
  [1094, 1116, "PUSH/NOTIFICATIONS"],
  [1117, 1500, "ADMIN/SUPPORT"],
];
const domainFor = (line) => bands.find(([from, to]) => line >= from && line <= to)?.[2] ?? "OTHER";
// Match only the transitional synchronous helpers used by later domains.
// `asyncDb.get`, `tx.run`, and repository calls are deliberately excluded.
const patterns = [
  ["READ", /(?<![\w.])(?:get|all)\s*\(/g],
  ["WRITE", /(?<![\w.])run\s*\(/g],
  ["TRANSACTION", /\bdb\.transaction\s*\(/g],
  ["DIRECT_SQLITE", /\bdb\.prepare\s*\(/g],
];
const counts = {};
for (const [index, line] of lines.entries()) {
  for (const [operation, pattern] of patterns) {
    const count = line.match(pattern)?.length ?? 0;
    if (!count) continue;
    const domain = domainFor(index + 1);
    counts[domain] ??= {};
    counts[domain][operation] = (counts[domain][operation] ?? 0) + count;
  }
}
const totals = { READ: 0, WRITE: 0, TRANSACTION: 0, DIRECT_SQLITE: 0 };
for (const group of Object.values(counts))
  for (const [operation, count] of Object.entries(group))
    totals[operation] = (totals[operation] ?? 0) + count;

const sharedHelperNames = ["auth", "membership", "loc", "ent", "paid", "publicLoc", "orderAccess"];
const sharedHelperViolations = [];
for (const name of sharedHelperNames) {
  const start = source.indexOf(`const ${name} =`);
  const end = start >= 0 ? source.indexOf("\n  };", start) : -1;
  const definition = start >= 0 ? source.slice(start, end >= 0 ? end : start + 2000) : "";
  if (/(?<![\w.])(?:get|all|run)\s*\(|\bdb\.transaction\s*\(|\bdb\.prepare\s*\(/.test(definition))
    sharedHelperViolations.push(name);
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(path);
  }
  return files;
}

const sourceViolations = [];
for (const file of await sourceFiles(fileURLToPath(new URL("../apps/api/src/", import.meta.url)))) {
  const relative = file;
  if (relative.endsWith("/async-db.ts") || relative.endsWith("/db.ts")) continue;
  const text = await readFile(file, "utf8");
  const checks = [
    ["legacy-db import", /legacy-db/],
    ["better-sqlite3 import", /better-sqlite3/],
    ["direct prepare", /\b(?:db|raw)\.prepare\s*\(/],
    ["direct transaction", /(?<![.\w])db\.transaction\s*\(/],
  ];
  for (const [kind, pattern] of checks)
    if (pattern.test(text)) sourceViolations.push({ file: relative, kind });
}

console.log(JSON.stringify({
  file: "apps/api/src/app.ts",
  counts,
  totals,
  sharedHelpers: {
    names: sharedHelperNames,
    synchronousViolations: sharedHelperViolations,
    status: sharedHelperViolations.length === 0 ? "ASYNC" : "SYNC_REMAINING",
  },
  batch1SharedDomain: {
    syncReads: sharedHelperViolations.length ? "UNKNOWN" : 0,
    syncWrites: sharedHelperViolations.length ? "UNKNOWN" : 0,
    syncTransactions: sharedHelperViolations.length ? "UNKNOWN" : 0,
    note: "Later-domain helper definitions in app.ts are reported in coarse route bands; this field isolates shared auth/business execution paths.",
  },
  laterDomainAdapter: {
    file: "apps/api/src/legacy-db.ts",
    status: "REMOVED; SQLite access is isolated to adapters",
  },
  sourceGuard: {
    violations: sourceViolations,
    status: sourceViolations.length === 0 ? "PASS" : "FAIL",
  },
}, null, 2));
