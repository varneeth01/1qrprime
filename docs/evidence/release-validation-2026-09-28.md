# External validation attempt record

Recorded: `2026-09-28T20:38:46+05:30` (Asia/Kolkata)

## Android

- Host: Linux; Android SDK `/home/varneeth/Android/Sdk`.
- Installed NDK: `26.1.10909125`.
- Required NDK: `27.0.12077973`.
- Command attempted: `ANDROID_HOME=/home/varneeth/Android/Sdk sdkmanager "ndk;27.0.12077973"`.
- Result: failed with `PermissionError: [Errno 13] Permission denied: /home/varneeth/Android/Sdk/ndk/27.0.12077973`; the parent `ndk` directory is root-owned. `sudo -n` also failed because a password is required.
- EAS fallback: `npx eas-cli@24.8.0 build --platform android --profile preview --non-interactive`.
- Result: failed before build because an Expo account/token is required: `An Expo user account is required to proceed.`
- APK/AAB: not produced; no checksum or install evidence exists.
- Connected devices: `adb devices -l` returned no devices.

## iOS

- Host: Linux (`uname -s` returned `Linux`).
- `xcodebuild` is unavailable and no `/Applications/Xcode*.app` exists.
- Signed iOS build, physical-iPhone install, TestFlight build, and checksum: not produced.

## Production services

- Production startup guard tested with missing SMTP: exit code `1`, `Production requires SMTP_URL and MAIL_FROM for account recovery`.
- Docker Compose configuration tested with an empty environment: exit code `1`, required `PUBLIC_ORIGIN` interpolation failed.
- A production-mode staging startup smoke test with syntactically valid, non-routable example SMTP values and a temporary SQLite database listened successfully on port `3998`. This verifies configuration parsing and process startup only; it is not SMTP delivery or production-service validation.
- Local backup/restore drill completed with a temporary SQLite database: `scripts/backup.ts` produced a timestamped SQLite backup, and opening the backup returned `{ name: 'Restore check' }`.
- SMTP, object storage, EAS push credentials, APNs, FCM, monitoring, and production database credentials are not configured.

## Payments and QR

- No provider sandbox or merchant account is available.
- No signed webhook/status/refund evidence exists.
- The QR matrix remains untested on physical PhonePe, Paytm, BHIM, Google Pay, Android Camera, iPhone Camera, and other UPI scanner devices.
- The stable customer-page QR and separate UPI QR fallback remain enabled.

## HTTPS staging validation

- No public staging deployment URL is available, so HTTPS connectivity, recovery-link origin, secure-cookie behavior, deployed health, and logged-out public-page access remain unverified.
- `PUBLIC_ORIGIN=http://localhost:5173 node scripts/staging-origin-check.mjs` correctly failed because staging origins must use HTTPS.
- `PUBLIC_ORIGIN=https://staging.example.com QR_SLUG=demo node scripts/staging-origin-check.mjs` passed static origin/payload validation and printed `https://staging.example.com/b/demo?source=qr`. This is an example-origin check only; it did not contact a deployment.
- The local fixture in `docs/qr-poc/payloads.json` intentionally uses `http://localhost:5173` for development and is not a staging or production QR asset. Printable staging assets must be generated only after the real HTTPS origin check passes.
- The subsequent staging execution boundary is recorded in [`staging-execution-2026-09-28.md`](staging-execution-2026-09-28.md); no deployment URL or external service evidence was available.
