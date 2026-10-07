# Acceptance report

## Verified and working

- 22 API tests pass: authentication/session expiry, reset tokens, cookie flags, durable migrations, tenant isolation, category templates, stable slugs, unsafe links, profile conflicts, menu availability, order idempotency and recovery, order state machine, route verification/activation/failover/rollback and snapshots, role restrictions, entitlement lapse, audit immutability, abuse reports, export/deletion, and forged-payment rejection.
- Web and native TypeScript checks pass.
- Web production build passes.
- Expo iOS and Android bundles export successfully from the current project.
- Full local Playwright smoke flow passes using system Chrome: signup, location creation, profile publishing, menu persistence, mobile cart/order submission and reload recovery, live manager status, reconnect indicator, QR download, 390px overflow check, customer and merchant WCAG A/AA checks, and no browser runtime errors.
- Prettier check passes across API, web, native, and release scripts.
- QR PNG/SVG assets and exact payload fixtures are generated under `docs/qr-poc/assets`.

## Fixed during final review

- Updated Android release documentation with the exact NDK failure and EAS/SDK-manager recovery path.
- Added store submission worksheets for App Store and Google Play metadata, privacy/data-safety, review notes, and test-account instructions.
- Added the missing “other UPI scanner” row and exact generated payload hash handling to the QR matrix/tooling.
- Corrected five WCAG contrast violations found by the full browser smoke run.
- Made unsupported webhook/status/refund capabilities explicit in release documentation.
- Added exact local, Android, EAS, macOS/Xcode, push, SMTP, object-storage, provider, TestFlight, and Play internal-testing commands.
- Added the external-validation register and release decision table to the release handoff.
- Confirmed production startup and Docker Compose fail clearly when required values are absent.
- Recorded the latest external validation attempts and local backup/restore evidence in `docs/evidence/release-validation-2026-09-28.md`.

## Blocked by credentials, devices, partner access, or operating system

- SMTP password reset/email verification in production: set `SMTP_URL` and `MAIL_FROM`.
- Object storage uploads: set S3 bucket/public origin and IAM credentials.
- Push delivery: configure EAS/APNs/FCM and `EXPO_ACCESS_TOKEN` where required.
- Provider-verified payments: supply a documented provider, credentials, signed webhooks, status API, and partner approval.
- External staging and release prerequisites are tracked in `docs/evidence/external-validation-handoff.md`; no credentials, device results, or provider evidence are fabricated.
- Store distribution: Apple/Google accounts, signing keys, listing URLs, screenshots, forms, internal tracks, and review accounts.

## Unverified external behavior

The one-QR scanner-specific route is unverified. No browser user-agent guess is used. The fallback is a stable customer-page QR with an explicit Pay action plus an optional separate UPI QR. Complete the real-device matrix with exact PhonePe, Paytm, BHIM, Google Pay, Android-camera, and iPhone-camera versions before marketing scanner-specific behavior.

Provider-verified payment callbacks, status queries, refunds, delayed callback handling, and provider-specific payer/merchant failure classification remain unverified because no provider adapter or credentials are configured. The current basic UPI adapter intentionally exposes only a deep link and `confirmation pending` state.

## Deferred

Kitchen-display routing, inventory/POS/GST/delivery integrations, automatic health-based payment switching, automatic appointment confirmation/calendar sync, provider refunds, and subscription purchase UI are deferred. iOS device build/signing and store submission are blocked until macOS/Apple credentials; Android local native APK compilation was attempted and failed because NDK `27.0.12077973` was unavailable and SDK metadata could not be downloaded. Android internal release is blocked until that NDK or a successful EAS build plus signing credentials is supplied. No app has been submitted or approved.

`npm audit --omit=dev --audit-level=high` exits successfully for high/critical thresholds but reports 11 moderate transitive Expo/tooling advisories, including `uuid`; the available automatic fix is a breaking downgrade. Revisit when the Expo dependency line publishes a compatible fix.
# Restaurant ordering completion update

Verified locally after the restaurant extension:

- Migrations `003_restaurant_ordering.sql` and `004_onboarding_public_identity.sql` apply on fresh and existing databases.
- Category, item, variant, modifier-group, modifier, table, menu, order, tracking-token, and explicit rejection-reason integration tests pass.
- Server totals are authoritative: variant/modifier prices, tax, packaging, service, and delivery fees are calculated from database/profile values.
- Public order retries remain idempotent and customer status can be read with an opaque tracking token.
- Web production build and API/native TypeScript checks pass.

Physical Android validation passed on the authorized TECNO KN3: release APK installed/launched, mobile account session reached onboarding, restaurant was published, QR render/download/share paths were exercised, physical Chrome opened the QR destination, a real order was persisted, and the customer page observed merchant transitions through Completed. A camera-based QR scan was not performed and remains explicitly unverified.
