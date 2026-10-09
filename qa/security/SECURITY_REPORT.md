# 1QR Prime Security and Production Acceptance

Date: 2026-10-09

## Git and production

- Local SHA: `bcf982445f14ed1f840bdf0e6066811cc101cdab`
- Remote `coolify-production` SHA: `bcf982445f14ed1f840bdf0e6066811cc101cdab`
- Deployed SHA: not verifiable from the repository; live web asset differs from the current local build.
- Web: PASS, HTTPS 200.
- API health: PASS, HTTPS 200.
- API ready: PASS, HTTPS 200, database and migrations true.
- Admin: PASS, HTTPS 200.

## Executive summary

The bounded live unauthenticated and disposable-tenant tests did not demonstrate authentication bypass, cross-tenant access, admin access by an owner, SQL injection, payment-state forgery, or token reuse after logout. Local API regression tests pass 27/27 and the source inventory is 0/0/0.

The assessment is not complete: no retained disposable credentials were available for the full role matrix, and the connected Android device was locked. Two concrete issues were found and addressed only in the local branch: the QR print view's stored-XSS sink and incomplete CORS method configuration. A pre-existing Android release manifest also enabled cleartext traffic and backup; a tracked config-plugin hardening change was made, but the final APK could not be rebuilt locally because the pinned NDK was unavailable. Production has not received these local changes.

## Attack surface

- Route registrations: 74.
- Public/unauthenticated routes: health/readiness/config/templates, auth entry/recovery/verification, public customer/QR/events/orders/payments/requests/reports, opaque-token order views, and local media when enabled.
- Authenticated merchant routes: account, locations, menu, tables, orders, payments, requests, analytics, audit, staff, push and export/delete.
- Admin routes: 9 `/api/admin/*` registrations, with read access checked by admin role and mutations requiring `admin`.
- Full route details: [ROUTE_MATRIX.md](./ROUTE_MATRIX.md).
- Role details: [AUTHORIZATION_MATRIX.md](./AUTHORIZATION_MATRIX.md).

## Results

| Area | Result | Evidence / limitation |
|---|---|---|
| Authentication | PASS for bounded tests; INCOMPLETE overall | Invalid token and post-logout token denied; reset/session tests pass locally. Full production reset/verification not run. |
| Authorization / IDOR | PASS for exercised disposable resources; INCOMPLETE overall | A→B location/menu/table/item reads and writes denied 403. Full endpoint matrix needs retained credentials. |
| Tenant isolation | PASS for exercised flows; INCOMPLETE overall | Repository queries are location/tenant scoped and live cross-tenant probes passed. |
| Role separation | INCOMPLETE | Owner→admin denial observed; manager/support live roles not exercised. |
| Admin security | PASS for owner denial; INCOMPLETE overall | `/api/admin/accounts` from owner returned 403. Full admin/support matrix not run. |
| SQL injection | PASS static review/local tests | Repository SQL uses bound parameters; no user-controlled SQL fragments found in reviewed repositories. |
| XSS | LOCAL FIX APPLIED; production retest pending | `document.write` interpolation in QR print was replaced with DOM `textContent`/attribute assignment. |
| CSRF | PASS in local tests; production browser matrix incomplete | SameSite strict cookies, origin hook, JSON content-type gate and local CSRF regression pass. |
| CORS | LOCAL FIX APPLIED; production still old until redeploy | Live allowed origins are exact and evil origins were denied, but live allow-methods omitted PUT/PATCH/DELETE. Source now explicitly allows required methods. |
| SSRF | NOT APPLICABLE in reviewed API paths | No user-controlled server-side URL fetch was found; push uses a fixed Expo endpoint. |
| File upload | Static PASS; live authenticated upload not run | MIME, 5 MiB/one-file multipart limit, sharp decode and generated storage keys reviewed. |
| Path traversal | PASS static review | Local media route restricts tenant/asset names and uses generated keys; authenticated media test not run. |
| Mass assignment | PASS for reviewed schemas | Sensitive fields are not accepted by the main route schemas; live role-body tampering remains to be run. |
| Prototype pollution | INCOMPLETE | Profile merge uses Zod parsing, but no dedicated production JSON abuse test was run. |
| Session security | PASS locally and bounded production logout | Random token, SHA-256 DB hash, expiry and revocation reviewed; production reset/multi-session test pending. |
| Recovery / verification | PASS locally; production email flow incomplete | One-use/expiry/revocation tests pass locally; no production mailbox was available. |
| Rate limiting | INCOMPLETE | Route and auth limits are configured; proxy-header spoof resistance needs deployment-specific validation because non-Vercel production uses `trustProxy: true`. |
| Payment security | PASS locally; production payment not exercised | Amount authority, independent verification and false-success tests pass locally. |
| Order security | PASS locally; production order not exercised | Tenant-scoped order queries, immutable snapshots and state transitions covered locally. |
| QR/public API privacy | PASS for unpublished denial and public DTO review; full production page not run | Public DTO intentionally includes public ID/table context; private account/audit fields are excluded. |
| Security headers/TLS | PASS baseline | HTTPS, HSTS, nosniff, frame protection and API CSP observed. Web CSP is not supplied by the API and should be reviewed in hosting config. |
| Secrets | PASS tracked-source scan | No values were printed or committed; only expected configuration references/examples were found. |
| Dependency security | PASS API production dependency audit | `npm audit --workspace apps/api --omit=dev`: 0 vulnerabilities. Workspace-wide audit reports mobile/toolchain findings requiring separate dependency triage. |
| Android security | FAIL/INCOMPLETE | Existing APK manifest enabled cleartext/backup; source hardening is local but final APK rebuild was blocked by missing NDK. |
| Android authenticated QA | INCOMPLETE | Device locked; no authenticated session/credentials. |
| Functional web QA | INCOMPLETE | Public roots/API smoke and local suite pass; full authenticated production workflows pending. |
| Functional Android QA | INCOMPLETE | Cold-launch command/log capture only; locked device prevented UI matrix. |

## Findings

### SEC-001 — QR print stored-XSS sink

- Severity: HIGH before fix.
- Affected file: `apps/web/src/main.tsx` QR print card.
- Prerequisite: authenticated merchant controls a business name and a victim opens the print view.
- Reproduction before fix: a business name containing HTML/handler markup was interpolated into `w.document.write(...)`.
- Impact: script-capable markup could execute in the print window under the application origin.
- Fix: construct title, heading, image and paragraphs through DOM APIs; use `textContent` and an encoded image path.
- Regression: source search shows no executable `document.write`/`innerHTML` sink; web typecheck/build pass.
- Retest: local static retest PASS; production redeploy/browser retest pending.
- Status: fixed locally, not deployed.

### SEC-002 — Live CORS preflight omitted mutation methods

- Severity: MEDIUM functional/security hardening.
- Affected file: `apps/api/src/app.ts` CORS registration.
- Evidence: live preflight allowed `GET,HEAD,POST` while application clients use PUT/PATCH/DELETE. Exact evil origins were denied.
- Impact: direct browser clients can fail legitimate mutation requests; this is not an origin-bypass.
- Fix: source now explicitly allows `GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS`; a local regression test asserts PATCH appears in the preflight method list.
- Status: fixed locally, production deployment/retest pending.

### SEC-003 — Android release manifest allowed cleartext and backup

- Severity: HIGH for cleartext; MEDIUM for backup exposure.
- Affected artifact: pre-existing generated release APK/manifest for `in.oneqr.prime`.
- Evidence: `aapt`/merged manifest reported `allowBackup=true` and `usesCleartextTraffic=true`.
- Fix: `apps/mobile/app.config.js` now sets cleartext false and `apps/mobile/plugins/with-android-security.js` enforces both release attributes.
- Retest: source/prebuild output shows false; final APK packaging was blocked by missing NDK `27.0.12077973` after native regeneration.
- Status: source fixed, packaged-APK retest required before release.

### SEC-004 — Unbounded proxy trust requires deployment validation

- Severity: MEDIUM hardening.
- Affected files: `apps/api/src/app.ts`, `apps/api/src/server.ts`.
- Evidence: non-Vercel production sets Fastify `trustProxy` to boolean true. If the external proxy does not overwrite forwarding headers, clients may influence effective IP/rate-limit identity.
- Recommendation: configure a verified proxy hop/IP policy and test spoofed `X-Forwarded-For` behavior in the actual Coolify topology. No exploit was attempted against production beyond safe observation.
- Status: open hardening item.

## Cleanup note

The bounded live test created two synthetic accounts. Tenant B was deleted successfully. Tenant A was logged out before its deletion token was retained, so its synthetic account/location remains for operator cleanup; its synthetic identifier is intentionally not repeated in this report. No real account, business, order or payment data was touched.

## Final release decision

# INCOMPLETE — REQUIRED SECURITY TESTS NOT EXECUTED

The critical reason is the absence of authenticated production web/mobile credentials/session and the locked physical Android device. Production health is currently passing, but this report does not claim security acceptance or production readiness.
