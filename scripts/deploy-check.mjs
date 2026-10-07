const required = {
  PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
  API_PUBLIC_ORIGIN: process.env.API_PUBLIC_ORIGIN,
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
};

if (process.env.DATABASE_DRIVER !== "postgres")
  throw new Error("Production DATABASE_DRIVER must be postgres");
if (!process.env.DATABASE_URL) throw new Error("Production DATABASE_URL is required");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  throw new Error("Production SESSION_SECRET must be at least 32 characters");
if (!process.env.BLOB_READ_WRITE_TOKEN)
  throw new Error("Production BLOB_READ_WRITE_TOKEN is required");

if (/trycloudflare\.com|localhost|127\.\d+\.\d+\.\d+|10\.0\.2\.2|^http:/i.test(process.env.DATABASE_URL))
  throw new Error("Production DATABASE_URL contains a preview, loopback, emulator, or insecure host");

for (const [name, value] of Object.entries(required)) {
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  if (/trycloudflare\.com|localhost|127\.\d+\.\d+\.\d+|10\.0\.2\.2/i.test(value))
    throw new Error(`${name} contains a preview/loopback/emulator host: ${value}`);
}

if (required.PUBLIC_ORIGIN !== "https://1qrprime.com")
  throw new Error("Production PUBLIC_ORIGIN must be https://1qrprime.com");
if (required.API_PUBLIC_ORIGIN !== "https://api.1qrprime.com")
  throw new Error("Production API_PUBLIC_ORIGIN must be https://api.1qrprime.com");
if (required.ADMIN_ORIGIN !== "https://admin.1qrprime.com")
  throw new Error("Production ADMIN_ORIGIN must be https://admin.1qrprime.com");

console.log(JSON.stringify({
  productionOrigins: required,
  qrOrigin: `${required.PUBLIC_ORIGIN}/q/<publicId>`,
  loopback: false,
  temporaryTunnel: false,
}));
