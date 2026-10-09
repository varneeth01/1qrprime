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
