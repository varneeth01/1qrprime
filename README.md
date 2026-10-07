# 1QR Prime

# 1qrprime

1QR Prime gives Indian merchants a stable business page, printable QR assets, category modules, menu orders, auditable payment destinations, and a native merchant app. Customers can use the public page without an app or account.

## Start locally

```sh
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs on port 3001 and the Vite proxy keeps browser requests same-origin. `DATABASE_PATH` defaults to `apps/api/data/prime.sqlite` when the API is started from its workspace; use an explicit path in production.

## Test from another phone

`localhost` always means the device that opens the URL. It is therefore local-only and must never be shared as a customer QR. With `cloudflared` installed, stop any existing API process and run:

```sh
npm run dev:share
```

The command starts the web service if needed, creates a temporary HTTPS Cloudflare Quick Tunnel, starts the API with that tunnel as `PUBLIC_ORIGIN`, and prints a URL such as `https://example-words.trycloudflare.com`. Share that URL or append `/q/<publicId>` to test the customer action hub from another network or phone. Vite proxies `/api` to the local API through the same public origin, so no second API tunnel or wildcard credentialed CORS is required.

Quick Tunnels are temporary development infrastructure. Order status uses the existing polling fallback, and QR Studio marks these as `PREVIEW` / `Temporary test QR`; never print a Quick Tunnel QR for production. For a stable staging hostname, set `PUBLIC_ORIGIN=https://staging.example.com` in the staging API environment and serve the web/API through that same origin. Validate a deployed preview with:

```sh
PUBLIC_ORIGIN=https://your-preview-host.example npm run preview:check
```

The check also accepts `PUBLIC_ID=<business-public-id>` to verify the customer route. `API_PUBLIC_ORIGIN` is reserved for a deliberately separate deployment; the supported local preview path intentionally keeps web and API same-origin.

For the native merchant app, browser-relative `/api` is not available. Configure the build explicitly:

```sh
EXPO_PUBLIC_ENVIRONMENT=preview
EXPO_PUBLIC_API_URL=https://your-preview-host.trycloudflare.com/api
EXPO_PUBLIC_WEB_ORIGIN=https://your-preview-host.trycloudflare.com
```

Preview, staging, and production mobile builds fail closed if their API URL is localhost, `127.x`, or `10.0.2.2`. Those hosts are reserved for explicitly local development/emulator workflows.

Run the checks with `npm run build`, `npm run typecheck`, and `npm test`. Native typechecking and Expo bundle export are documented in [docs/RELEASE.md](docs/RELEASE.md).

## Product surfaces

- `/` — merchant web console
- `/b/:slug` — public customer action page
- Support console — visible only to an audited admin account
- `apps/mobile` — Expo merchant app for iOS and Android

## Production domains

Production is deliberately separate from the temporary Quick Tunnel workflow:

```text
https://1qrprime.com          customer web and QR pages
https://admin.1qrprime.com    internal admin/support web
https://api.1qrprime.com      Fastify API and workers
```

Use [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the Vercel-only topology,
production mobile configuration, and the one-time migration from test QR
artwork to `1qrprime.com`. The current API remains SQLite-only and refuses
production startup until its PostgreSQL adapter is implemented.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/RELEASE.md](docs/RELEASE.md), and [docs/TEST_REPORT.md](docs/TEST_REPORT.md) before deploying. The one-QR scanner proof-of-concept and required matrix live in [docs/qr-poc](docs/qr-poc).

External deployment prerequisites, owners, commands, and evidence locations are listed in [docs/evidence/external-validation-handoff.md](docs/evidence/external-validation-handoff.md). Payment-provider implementation requirements are in [docs/evidence/provider-adapter-checklist.md](docs/evidence/provider-adapter-checklist.md).

Store submission drafts are in [docs/store](docs/store). They are preparation worksheets and still require the operator’s legal identity, live URLs, screenshots, signed builds, privacy declarations, review credentials, and store-console submission.
# Restaurant ordering

1QR Prime now supports a persisted restaurant ordering flow: menu categories, item variants, required/optional modifiers, customer checkout, table QR context, authoritative taxes/fees, idempotent order creation, merchant order status transitions, and customer tracking tokens. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the model and [`docs/RELEASE.md`](docs/RELEASE.md) for release gates.
