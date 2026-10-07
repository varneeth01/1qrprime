const origin = process.env.PUBLIC_ORIGIN;
const slug = process.env.QR_SLUG || "staging-check";

if (!origin) throw new Error("PUBLIC_ORIGIN is required");
const parsed = new URL(origin);
if (parsed.protocol !== "https:")
  throw new Error(`PUBLIC_ORIGIN must use HTTPS: ${origin}`);
if (/localhost|127\.0\.0\.1|0\.0\.0\.0|oneqrprime:/.test(origin))
  throw new Error(
    `PUBLIC_ORIGIN contains a local or native-only host: ${origin}`,
  );

const page = `${origin.replace(/\/$/, "")}/b/${encodeURIComponent(slug)}?source=qr`;
if (/localhost|127\.0\.0\.1|0\.0\.0\.0|oneqrprime:/.test(page))
  throw new Error(
    `QR payload contains a local or native-only destination: ${page}`,
  );

console.log(
  JSON.stringify({
    origin,
    corsOrigin: origin,
    csrfOrigin: origin,
    qrPayload: page,
  }),
);

if (process.env.STAGING_URL) {
  const staging = new URL(process.env.STAGING_URL);
  if (staging.protocol !== "https:")
    throw new Error(`STAGING_URL must use HTTPS: ${staging}`);
  const [health, pageResponse] = await Promise.all([
    fetch(new URL("/health", staging)),
    fetch(new URL(`/b/${encodeURIComponent(slug)}?source=qr`, staging)),
  ]);
  if (!health.ok) throw new Error(`Health check failed: HTTP ${health.status}`);
  if (!pageResponse.ok)
    throw new Error(`Customer page check failed: HTTP ${pageResponse.status}`);
  console.log(
    `staging health and public page checks passed for ${staging.origin}`,
  );
}
