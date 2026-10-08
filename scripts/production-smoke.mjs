const publicOrigin = (process.env.PUBLIC_ORIGIN || "https://1qrprime.com").replace(/\/$/, "");
const apiOrigin = (process.env.API_PUBLIC_ORIGIN || "https://api.1qrprime.com").replace(/\/$/, "");

const checks = [
  [`${apiOrigin}/api/health`, { ok: true }],
  [`${apiOrigin}/api/ready`, { ok: true, database: true, migrations: true }],
  [`${publicOrigin}/api/health`, { ok: true }],
];

for (const [url, expected] of checks) {
  const response = await fetch(url, { redirect: "manual" });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || response.status >= 300 || !contentType.includes("application/json"))
    throw new Error(`${url}: unexpected HTTP response ${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${url}: response was not valid JSON`);
  }
  for (const [key, value] of Object.entries(expected))
    if (body[key] !== value) throw new Error(`${url}: ${key} expected ${value}, received ${body[key]}`);
  console.log(`${url}: PASS`);
}
