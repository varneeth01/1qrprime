const origin = process.env.PUBLIC_ORIGIN;
if (!origin) throw new Error("PUBLIC_ORIGIN is required");
const parsed = new URL(origin);
if (parsed.protocol !== "https:") throw new Error(`Shared preview requires HTTPS: ${origin}`);
if (/localhost|127\.0\.0\.1|0\.0\.0\.0|oneqrprime:/i.test(origin)) throw new Error(`Shared preview cannot use a local origin: ${origin}`);
const health = await fetch(new URL("/api/health", origin));
if (!health.ok) throw new Error(`API health failed: HTTP ${health.status}`);
const runtime = await fetch(new URL("/api/runtime-config", origin));
if (!runtime.ok) throw new Error(`Runtime config failed: HTTP ${runtime.status}`);
const runtimeConfig = await runtime.json();
if (runtimeConfig.apiBaseUrl !== "/api") throw new Error(`Shared preview must use same-origin API base: ${runtimeConfig.apiBaseUrl}`);
if (/localhost|127\.\d+\.\d+\.\d+|10\.0\.2\.2/i.test(JSON.stringify(runtimeConfig))) throw new Error("Runtime config contains a loopback API reference");
const invalidSignup = await fetch(new URL("/api/auth/register", origin), { method: "POST", headers: { "content-type": "application/json", "x-client": "browser" }, body: JSON.stringify({}) });
if (![400, 422].includes(invalidSignup.status)) throw new Error(`Signup endpoint check returned unexpected HTTP ${invalidSignup.status}`);
const publicId = process.env.PUBLIC_ID;
if (publicId) {
  const page = await fetch(new URL(`/q/${encodeURIComponent(publicId)}`, origin));
  if (!page.ok) throw new Error(`Customer page failed: HTTP ${page.status}`);
}
console.log(JSON.stringify({ origin: parsed.origin, https: true, api: health.status === 200, auth: true, loopback: false, publicId: publicId || null }));
