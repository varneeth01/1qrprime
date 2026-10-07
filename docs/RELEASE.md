# Release and store handoff

## Local verification

```sh
cp .env.example .env
npm install
npm run build
npm run typecheck
npm test
cd apps/mobile && npm run typecheck && npx expo export --platform ios --platform android
```

The final local review also runs:

```sh
npx prettier --check 'apps/api/src/**/*.{ts,tsx}' 'apps/api/test/*.ts' \
  'apps/web/src/**/*.{ts,tsx,css}' 'apps/mobile/*.{ts,tsx,js}' \
  'scripts/*.{ts,mjs}'
node scripts/web-smoke.mjs
npm audit --omit=dev --audit-level=high
```

Production startup guard checks:

```sh
NODE_ENV=production PUBLIC_ORIGIN=https://prime.example \
  SUPPORT_EMAIL=support@example.com PORT=3999 \
  DATABASE_PATH=/srv/1qr/prime.sqlite node --import tsx apps/api/src/server.ts
# This must fail clearly until SMTP_URL and MAIL_FROM are supplied.
docker compose config
# This must fail clearly until PUBLIC_ORIGIN, SUPPORT_EMAIL, SMTP_URL, and MAIL_FROM are supplied.
```

For Android, set `EAS_PROJECT_ID` and run `eas build --platform android --profile preview` for an internal APK or `eas build --platform android --profile production` for an AAB. The generated native project requires Android NDK `27.0.12077973`; the local machine did not have that exact NDK and the build failed while SDK metadata was unreachable. Install that exact NDK with Android Studio/`sdkmanager` or use EAS, then install the resulting APK on a real/emulated device before calling it release-ready. For iOS, run the same with `--platform ios` from macOS with an Apple Developer team configured. The repository has bundle identifier `in.oneqr.prime`, Android application ID `in.oneqr.prime`, target API 36, adaptive icon assets, notification permission handling, privacy manifest declarations, the `oneqrprime://` native scheme, and a free companion workflow. Universal Links/App Links are intentionally not configured: customer QR links open the web page without requiring the merchant app.

## App Store Connect actions still required

Create the App ID, Apple Developer team/signing credentials, App Store Connect record, privacy policy/support URLs, screenshots on supported iPhone sizes, accurate data collection answers, review notes with a live demo account and QR, and TestFlight internal group. Do not claim approval before review. If merchant plan purchases are later enabled, implement and document the applicable in-app purchase or approved exception first.

## Google Play Console actions still required

Create the application, upload the signed AAB, complete Data safety and content rating forms, provide privacy/support URLs and screenshots, enroll an internal testing track, and verify target API 36. If alternative billing is used for India, enroll and report transactions through the current Google Play program before exposing the choice to users.

Local QA screenshots are available under `artifacts/screenshots/` for review of the sign-in, merchant overview, order desk, customer mobile page, and QR download. They are not store screenshots: store assets must be captured from signed builds at the current required device dimensions.

## Credentials and human verification

Production requires HTTPS origin, SMTP, support identity, object-storage bucket, deployment secret manager, EAS project, APNs/FCM credentials, and a payment provider/merchant verification process. Real device scans are required for the matrix in `docs/qr-poc/matrix.csv`. The current workspace has no Apple signing account, Google Play account, payment-provider credentials, or connected physical iOS/Android test phones.

The application has no configured webhook endpoint or provider signature verifier. `basic_upi` deliberately advertises `webhooks: false`, `statusQueries: false`, and `refunds: false`; do not configure provider callbacks until a provider adapter implements signed verification and its credentials have been approved.

The latest external-attempt evidence is recorded in [`docs/evidence/release-validation-2026-09-28.md`](evidence/release-validation-2026-09-28.md). It records the NDK permission failure, EAS authentication failure, Linux/Xcode limitation, production startup guards, and local SQLite backup/restore drill. The operator handoff is [`docs/evidence/external-validation-handoff.md`](evidence/external-validation-handoff.md); the provider implementation checklist is [`docs/evidence/provider-adapter-checklist.md`](evidence/provider-adapter-checklist.md).

Before deploying staging, run the HTTPS origin and public-page checks in [`docs/evidence/staging-setup.md`](evidence/staging-setup.md) with the real staging `PUBLIC_ORIGIN` and `STAGING_URL`. The latest execution boundary is recorded in [`docs/evidence/staging-execution-2026-09-28.md`](evidence/staging-execution-2026-09-28.md). Do not generate printable staging QR assets from the local `localhost` fixture.

## Readiness classification

### Verified locally

Build, typecheck, 22 API/security tests, Prettier, Playwright customer/merchant flows, WCAG checks, mobile overflow checks, payment-route state tests, tenant isolation, recovery, export/deletion, QR generation, and SQLite backup/restore have passed in the local workspace. Production-mode configuration parsing also succeeds with syntactically valid staging variables, but that is not service connectivity.

### Staging-ready but unconfigured

The API accepts secret-managed SMTP, object-storage, push, monitoring, and database settings; Docker health checks and startup guards are present. A staging deployment still needs real credentials, an isolated URL, service provisioning, migrations, and evidence for delivery/persistence/alerts.

### Blocked by credentials or platform access

Android NDK installation is blocked by SDK directory permissions and EAS requires an Expo account. iOS requires macOS, Xcode, Apple signing, and App Store Connect. SMTP, object storage, managed database, monitoring, APNs, FCM, payment, and store credentials are absent.

### Requires physical-device evidence

Android and iPhone installation, notification delivery, QR scans, and store internal testing require physical devices. The scanner matrix remains `NOT TESTED`/`UNVERIFIED`.

### Requires payment-provider evidence

Provider callbacks, status queries, refunds, reconciliation, delayed callbacks, and provider-specific failure classification remain unavailable. Basic UPI attempts remain confirmation-pending.

### Required before public launch

Complete staging service verification, signed Android and iOS builds, physical-device smoke tests, provider sandbox evidence, privacy/support URLs, store internal testing, monitoring, production backup/restore, and the QR matrix. Keep subscriptions disabled until compliant Apple/Google billing is implemented and reviewed.

## Exact release procedures

### Android Studio / sdkmanager

On a release workstation with Android SDK command-line tools installed:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.0.12077973"
cd apps/mobile
npx expo prebuild --clean --no-install
ANDROID_HOME="$ANDROID_HOME" ./android/gradlew assembleDebug --no-daemon --max-workers=2
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is only a device smoke artifact. A release artifact requires signing configuration and a clean install/update test.

### EAS Android build

```sh
npm install --global eas-cli
cd apps/mobile
eas login
eas project:init
EAS_PROJECT_ID=<approved-project-id> eas build --platform android --profile preview
EAS_PROJECT_ID=<approved-project-id> eas build --platform android --profile production
eas build:list --platform android --limit 5
```

Download the APK/AAB returned by EAS, install the APK on a test device, and record artifact checksum, device, OS, install/update result, and smoke-test evidence. Do not call an export or JavaScript bundle an APK/AAB.

### macOS / Xcode iOS build

```sh
cd apps/mobile
npx expo prebuild --clean --no-install
npx expo run:ios --configuration Release --device
eas credentials --platform ios
eas build --platform ios --profile production
eas build:list --platform ios --limit 5
```

The Apple Developer team must create `in.oneqr.prime`, provisioning, push entitlement, distribution certificate, and App Store Connect access. Install the signed build on a physical iPhone before submission.

### APNs / FCM and push outbox

```sh
cd apps/mobile
eas credentials --platform ios
eas credentials --platform android
```

Configure APNs production credentials and the Firebase service-account path through EAS/secret storage. Set `EXPO_ACCESS_TOKEN` only in the server secret manager, register a physical-device token through `/api/push`, create a test order, and capture the push receipt plus the manager polling fallback. Never depend on push as the only order-delivery channel.

### SMTP

Create a production SMTP credential in the approved mail provider, then inject values through the deployment secret manager:

```sh
export SMTP_URL='smtps://<secret-user>:<secret-password>@smtp.example.com:465'
export MAIL_FROM='1QR Prime <no-reply@example.com>'
```

Run password recovery and email verification against a non-production account. Confirm the email contains a single-use, expiring link and that the token is not logged.

### Object storage

Create a private bucket and a public CDN/origin for transformed images. Inject `AWS_REGION`, `S3_BUCKET`, and `S3_PUBLIC_ORIGIN` through the deployment secret manager and grant the API only object put/read permissions for the bucket prefix. Upload a JPEG, PNG, and WebP through the merchant console; verify conversion, size limits, content type, and public rendering. Do not put AWS keys in the client or repository.

### Payment-provider adapter

Keep the provider behind the `PaymentProvider` interface in `apps/api/src/domain.ts`. Before enabling a real provider:

```sh
rg -n "PaymentProvider|basicUpi|webhooks|statusQueries" apps/api/src apps/api/test
npm test
```

The provider owner must supply approved merchant credentials, session-creation/status/refund documentation, callback signing rules, sandbox endpoints, timeout/retry guidance, and a test merchant. Implement signed callback verification and provider-status reconciliation, add focused tests for success/failure/timeout/duplicate callbacks, then update the capability flags. Until those artifacts exist, keep `basic_upi` and `confirmation pending`.

### TestFlight

```sh
cd apps/mobile
eas build --platform ios --profile production
eas submit --platform ios --latest
```

In App Store Connect, add the build to an internal TestFlight group, provide a demo merchant account and sample QR, collect crash/notification/order evidence, and only then create the external review submission. Record the build number and reviewer notes.

### Google Play internal testing

```sh
cd apps/mobile
eas build --platform android --profile production
eas submit --platform android --latest
```

In Play Console, create the `in.oneqr.prime` application, upload the signed AAB to Internal testing, add tester accounts, complete Data safety/content rating, install from Play on a physical Android device, and record the track, version code, install/update result, notification result, and order-desk evidence.

## External validation required

| Owner                | Account / credential                                               | Device or platform                           | Expected evidence                                                              | Status                                |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| Release engineer     | Android SDK manager or EAS project                                 | Android 16/API 36                            | Signed APK/AAB checksum, install/update log, smoke results                     | Blocked: NDK/signing unavailable      |
| iOS release engineer | Apple Developer + App Store Connect                                | macOS/Xcode + physical iPhone                | Signed archive, TestFlight build number, install log                           | Blocked: macOS/account unavailable    |
| Operations           | SMTP provider credential                                           | Production/staging mail inbox                | Reset/verification delivery, expiry and single-use evidence                    | Blocked: SMTP unavailable             |
| Operations           | S3/IAM + CDN                                                       | API and mobile/web clients                   | Upload, transform, size rejection, rendering evidence                          | Blocked: object storage unavailable   |
| Mobile/ops           | EAS, APNs, FCM credentials                                         | Physical iOS and Android devices             | Push receipt, notification, polling fallback                                   | Blocked: push credentials unavailable |
| Payments partner     | Sandbox/production merchant account and signed webhook credentials | Provider sandbox plus test payer device      | Signed callback, status query, timeout, duplicate callback and refund evidence | Blocked: partner access unavailable   |
| QA/release           | PhonePe, Paytm, BHIM, Google Pay test apps                         | Exact Android/iPhone models and app versions | Matrix row with payload hash, screenshot, actual destination and result        | Unverified                            |
| Store owner          | Apple/Google store accounts                                        | App Store Connect / Play Console             | Listing, forms, internal testing, review submission IDs                        | Blocked: store accounts unavailable   |

## Release decision table

| Area                     | Status                         | Evidence                                                            | Remaining action                                    |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------- |
| Local web build          | Verified                       | `npm run build` and Playwright smoke                                | Deploy behind HTTPS and monitor                     |
| API/database locally     | Verified locally               | 22 API tests, migrations, health endpoint                           | Provision isolated staging persistence              |
| Security and isolation   | Verified locally               | Tenant, IDOR, session, admin, audit, URL, upload and deletion tests | Run production security review                      |
| Customer Action Page     | Verified locally               | Public page, QR generation, customer smoke flow                     | Deploy HTTPS and perform printed scan test          |
| Restaurant ordering      | Verified locally               | Cart, idempotency, sold-out checks, status/reconnect tests          | Run staging and physical-device order test          |
| Payment routing          | Verified locally for basic UPI | Route verification, activation, snapshot, failover, rollback tests  | Implement approved provider adapter                 |
| Provider confirmation    | Unverified                     | `basic_upi` capabilities explicitly false                           | Obtain sandbox and verify signed callbacks/status   |
| Android native build     | Blocked                        | NDK `27.0.12077973` unavailable; EAS unauthenticated                | Install NDK or authenticate EAS, sign and install   |
| iOS native build         | Blocked                        | No macOS/Xcode/signing account                                      | Build, sign, install, and upload TestFlight         |
| QR scanner compatibility | Unverified                     | Matrix rows remain `NOT TESTED`                                     | Complete exact app/device matrix                    |
| Production services      | Blocked                        | Startup guards only; no service credentials                         | Configure staging services and capture connectivity |
| Backup and restore       | Local drill verified           | Temporary SQLite backup reopened successfully                       | Perform managed production restore drill            |
| App Store                | Blocked                        | Metadata worksheets only                                            | Deploy URLs, upload signed build, run TestFlight    |
| Google Play              | Blocked                        | Metadata/Data Safety worksheet only                                 | Upload signed AAB and run internal testing          |
# Restaurant release gates

Before staging release, exercise the new proof flow with a seeded restaurant: create three categories, five items, one variant, one required modifier group, a table QR, submit a dine-in order, and advance it through Accepted, Preparing, Ready, and Completed from both web and Android. Verify the customer tracking page at each transition.

The new schema migration is `003_restaurant_ordering.sql`. It is backward compatible with the existing catalogue/order API and keeps old orders readable while new orders gain normalized snapshots and human-readable numbers.

Physical Android validation completed on an authorized `TECNO KN3` (Android 15, 720x1600, density 280): bundled release APK installed/launched, fresh mobile onboarding published a restaurant, QR sharing opened the system chooser, the same public QR loaded in Chrome, a menu item was added and ordered, and customer status reached Completed. Camera scanning itself remains untested; the QR was opened by ADB deep link and physical Chrome.

# Production pilot hardening status

Local development continues to use SQLite. Production startup now fails closed unless `NODE_ENV=production` has `DATABASE_URL`, HTTPS `PUBLIC_ORIGIN`, SMTP configuration, and `STORAGE_DRIVER=s3`; it also refuses to start the SQLite server in production. A PostgreSQL repository/adapter and SQLite-to-PostgreSQL migration are not yet implemented, so production pilot remains blocked until that boundary is completed.

The API exposes `/api/health` and `/api/ready`. S3-compatible endpoint/credential configuration, explicit SMTP fields, push-device metadata, and PostgreSQL `pg_dump`/`pg_restore` helper commands are documented and wired for the existing local architecture. They are not service-verification evidence without real staging credentials.

The current mobile push path is Expo push-token based and includes notification IDs for deduplication context. FCM/APNs provider credentials, background delivery, and notification deep-link verification remain external gates. iOS project configuration is present (`in.oneqr.prime`), but macOS/Xcode, signing, TestFlight, and physical iPhone verification are unavailable in this environment.
