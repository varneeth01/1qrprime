import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../apps/web/dist/assets/", import.meta.url).pathname;
const files = await readdir(root);
const offenders = [];
for (const file of files.filter((name) => /\.(js|css)$/.test(name))) {
  const text = await readFile(join(root, file), "utf8");
  if (/https?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|10\.0\.2\.2)(?::\d+)?/i.test(text)) offenders.push(file);
}
if (offenders.length) throw new Error(`Runtime bundle contains loopback URL(s): ${offenders.join(", ")}`);
console.log(JSON.stringify({ checked: files.length, loopbackUrls: 0 }));
