# 1QR Prime Functional Security Regression Report

Date: 2026-10-09

## Production smoke

- API health: PASS, HTTP 200.
- API readiness: PASS, HTTP 200 with `database:true` and `migrations:true`.
- Web root: PASS, HTTP 200.
- `www`: PASS, HTTP 308 to `https://1qrprime.com/`.
- Admin root: PASS, HTTP 200.
- Web `/api/health` proxy: PASS, HTTP 200 JSON.

## Local regression

- Typecheck: PASS.
- API build: PASS.
- Web build: PASS.
- SQLite test suite: 27/27 PASS.
- PostgreSQL tests: seven PostgreSQL files were skipped because no disposable PostgreSQL service was available in this run; the repository's prior verified baseline was 34/34.
- Inventory: 0 reads / 0 writes / 0 transactions / 0 direct SQLite route calls.

## Executed functional/security flows

- Registration of two disposable production users: PASS.
- Disposable location creation for both users: PASS.
- Cross-tenant location/menu/table reads: denied with 403.
- Cross-tenant profile/item writes: denied with 403.
- Invalid session: denied with 401.
- Logout revocation: PASS; old token denied with 401.
- Admin endpoint from ordinary owner: denied with 403.
- Disposable account B cleanup: PASS.

## Not executed

Authenticated web flows requiring a retained test credential beyond the bounded live probe were not run. No real account credentials were available to the audit, and the Android device was locked with no existing authenticated session exposed to the test process. Full customer checkout/payment and admin/support role matrix therefore remain incomplete.

## Continuation update — 2026-10-09

- Fresh production checks: API health PASS, API readiness PASS, web root PASS, admin root PASS, and `www` HTTPS redirect PASS.
- Fresh local regression: typecheck PASS; API/web build PASS; SQLite 27/27 PASS; inventory 0/0/0.
- PostgreSQL-specific tests remain skipped because Docker cannot connect to its daemon and no local PostgreSQL server is listening.
- The physical device is now awake and the app reaches the production sign-in screen, but authenticated flows still require a disposable test account or an existing session. No credentials were logged or entered automatically.
- Android build tooling diagnosis: the local SDK has build-tools/platforms but lacks the configured NDK 27.0.12077973; NDK 26.1 compilation fails in React Native native code. No APK replacement was installed.
# Commercial flow status

- Prime catalog: ₹1,599 reference price, ₹599/month launch price.
- Eligible categories: restaurant, cafe, hotel. Unsupported categories use the
  custom sales-lead path.
- Web checkout flow is implemented through the server order/verify endpoints,
  but live success/cancel/failure execution remains blocked by unavailable
  Razorpay test credentials.
- Android production release rebuilt with the canonical command and installed
  successfully on TECNO KN3. Authenticated commercial Android checkout was not
  executed because no disposable authenticated payment session was available.
- Admin sales-lead operations and billing operations are available in the
  restricted support console.
## Publish flow follow-up

Web and Android now submit publication through the same canonical endpoint: `POST /api/locations/:lid/publish`. The local flow preserves the permanent `/q/{publicId}` QR route, exposes the friendly `/b/{slug}` page only after publication, maps setup/plan/authorization failures to contextual messages, and is idempotent on repeat. The production endpoint remains unavailable until the API deployment is updated; direct production probe returned HTTP 404 route-not-found. Android release smoke after the current rebuild passed.
