# 1QR Prime deployment

## Production topology

```text
1qrprime.com          Vercel web + customer QR routes
admin.1qrprime.com    Vercel admin/support web
api.1qrprime.com      Vercel Fastify Function
```

The browser calls `/api/*`; Vercel proxies those requests to
`https://api.1qrprime.com/api/*`. Native builds call
`https://api.1qrprime.com/api` directly.

## Vercel

This repository contains a root `vercel.json` for the monorepo:

- Build command: `npm run build:web`
- Output directory: `apps/web/dist`
- API rewrite: `/api/:path*` → `https://api.1qrprime.com/api/:path*`
- SPA fallback: all non-API routes → `/index.html`

Configure the project with the repository root as its working directory. Set the
production domains `1qrprime.com` and `admin.1qrprime.com` as separate Vercel
projects or deployments as appropriate. Browser-visible variables must not
contain secrets. Production QR generation is controlled by the API's
`PUBLIC_ORIGIN`.

Run the static production-origin gate before deployment:

```sh
PUBLIC_ORIGIN=https://1qrprime.com \
API_PUBLIC_ORIGIN=https://api.1qrprime.com \
ADMIN_ORIGIN=https://admin.1qrprime.com \
npm run deploy:check
```

## Vercel API project

Create a separate Vercel project rooted at `apps/api`. Vercel recognizes the
existing `src/server.ts` Fastify entrypoint. The API project owns
`api.1qrprime.com`; it must use Vercel's Function runtime rather than a local
listener or a long-lived worker process. Configure:

```env
NODE_ENV=production
DATABASE_DRIVER=postgres
PUBLIC_ORIGIN=https://1qrprime.com
API_PUBLIC_ORIGIN=https://api.1qrprime.com
ADMIN_ORIGIN=https://admin.1qrprime.com
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
STORAGE_DRIVER=vercel-blob
BLOB_READ_WRITE_TOKEN=...
```

SMTP, Blob, push, and other credentials belong only in Vercel encrypted
environment variables. Do not commit them or expose them through `VITE_*`
variables.

## Current production gate

The current API still uses synchronous `better-sqlite3` access and explicitly
refuses to start with `NODE_ENV=production`. PostgreSQL support is therefore a
required implementation/deployment prerequisite; setting `DATABASE_URL` alone
is not sufficient. Do not deploy the current API as a Vercel Function until a
serverless PostgreSQL adapter and fresh-migration/restore tests are complete.

## Native builds

```sh
EXPO_PUBLIC_ENVIRONMENT=production \
EXPO_PUBLIC_API_URL=https://api.1qrprime.com/api \
EXPO_PUBLIC_WEB_ORIGIN=https://1qrprime.com \
npx expo run:android --variant release
```

Production mobile configuration fails closed for loopback, emulator, HTTP, and
Quick Tunnel API URLs. Do not use ADB reverse for production validation.

## QR migration

Existing `publicId` values remain unchanged. Existing Quick Tunnel artwork is
test artwork and must be regenerated once for production using:

```text
https://1qrprime.com/q/<publicId>
https://1qrprime.com/q/<publicId>?t=<tableToken>
```

Normal business, menu, payment, or customer-page changes do not require another
QR regeneration.

## Verification

After DNS, Vercel, TLS, Neon PostgreSQL, and Blob are provisioned, verify:

```sh
curl -fsS https://api.1qrprime.com/api/health
curl -fsS https://api.1qrprime.com/api/ready
curl -I https://1qrprime.com
curl -I https://1qrprime.com/q/<publicId>
```

Then build the production mobile artifact, scan a regenerated production QR on
the TECNO KN3, and run the owner/order/table acceptance flow without ADB
reverse.
