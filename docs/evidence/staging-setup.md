# Staging setup and HTTPS validation

Status: **staging-ready but unconfigured**. No public staging URL or external credential is available in this workspace. The production-mode startup smoke test with example SMTP values proved configuration parsing only; it did not prove connectivity or delivery.

## Public HTTPS and origin checks

Run from the repository root after the deployment operator has supplied the staging URL:

```sh
PUBLIC_ORIGIN=https://staging.example.com \
  QR_SLUG=staging-check \
  node scripts/staging-origin-check.mjs

PUBLIC_ORIGIN=https://staging.example.com \
  STAGING_URL=https://staging.example.com \
  QR_SLUG=<published-location-slug> \
  node scripts/staging-origin-check.mjs
```

The first command rejects `localhost`, loopback addresses, development hosts, native-only `oneqrprime://` destinations, and non-HTTPS origins. It prints the exact origin used by CORS, CSRF, recovery links, and page QR generation. The second command additionally checks `/health` and the public `/b/:slug?source=qr` page without authentication.

The operator must also verify in the deployed browser and API responses that:

- `PUBLIC_ORIGIN` exactly equals the staging HTTPS origin.
- CORS allows credentials only for that origin.
- CSRF origin checks accept the staging origin and reject another origin.
- Session cookies are `Secure`, `HttpOnly`, and `SameSite=Strict` over HTTPS.
- Password recovery and email-verification links use the same staging HTTPS origin.
- Downloaded page QR payloads contain the staging public page only after staging is approved; they must contain no localhost, loopback, development, or native scheme.
- The logged-out public page is available and exposes no private merchant/admin data.
- The separate payment QR remains a UPI payload and is not substituted for the page QR.

No staging URL or scan screenshot is recorded until these checks run against a real deployment.

## Dependency handoff

| Dependency            | Account/credential and variables                                                                  | Setup/test procedure                                                         | Expected evidence                                                   | Owner               | Gate                                        |
| --------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| SMTP/account recovery | Staging SMTP account; `SMTP_URL`, `MAIL_FROM`                                                     | Inject through secret manager; request reset and verification                | Delivered messages, expiry/single-use proof, redacted logs          | Operations          | Blocks staging acceptance and public launch |
| Object storage        | Private bucket, IAM role, CDN; `AWS_REGION`, `S3_BUCKET`, `S3_PUBLIC_ORIGIN`                      | Upload JPEG/PNG/WebP; test limits and rendering                              | Object key, content type, transformed image, rejected oversize file | Operations          | Blocks staging acceptance and public launch |
| Managed database      | Isolated staging database and credentials; approved `DATABASE_PATH` or database adapter variables | Run migrations, restart service, execute tenant/order persistence smoke test | Migration output and record persistence after restart               | Operations          | Blocks staging acceptance and public launch |
| Backups               | Backup bucket/volume and encryption key                                                           | Run `node --import tsx scripts/backup.ts` on staging                         | Timestamped backup checksum and retention record                    | Operations          | Public launch                               |
| Restore               | Isolated restore target                                                                           | Restore latest backup and run health/order/customer-page checks              | Restore timestamp, record verification, RTO/RPO                     | Operations          | Public launch                               |
| Monitoring            | Error/metrics project and DSN                                                                     | Configure secret-managed DSN; trigger redacted test error and health alert   | Captured event, alert, uptime result, redacted logs                 | Operations          | Public launch                               |
| APNs                  | Apple push key/team and EAS credentials                                                           | Configure EAS; register physical iOS token; create test order                | Push receipt and iPhone notification screenshot                     | Mobile release      | Internal testing/public launch              |
| FCM                   | Firebase project/service account and EAS credentials                                              | Configure EAS; register physical Android token; create test order            | Push receipt and Android notification screenshot                    | Mobile release      | Internal testing/public launch              |
| EAS                   | Expo account, project ID, `EXPO_ACCESS_TOKEN` in secret manager                                   | `eas login`; `eas project:init`; build preview/production                    | EAS build ID, signed artifact checksum, install result              | Release engineering | Internal testing/public launch              |
| Payment provider      | Approved sandbox/merchant account and credentials                                                 | Implement documented adapter; test callbacks/status/reconciliation           | Signed callback and provider transaction evidence                   | Payments partner    | Public launch                               |
| Apple Developer       | Team, App ID `in.oneqr.prime`, certificates, provisioning                                         | Xcode/EAS credentials and TestFlight upload                                  | Signed build, install, TestFlight build ID                          | iOS release         | Internal testing/public launch              |
| Google Play Console   | Developer account, app ID `in.oneqr.prime`, signing                                               | Upload signed AAB to Internal testing                                        | Track/version code and physical install evidence                    | Android release     | Internal testing/public launch              |
| Privacy URL           | Public HTTPS legal page                                                                           | Deploy and enter in both store consoles                                      | URL response and store form capture                                 | Product/legal       | Store submission                            |
| Support URL           | Public HTTPS support page                                                                         | Deploy support contact and escalation path                                   | URL response and support request evidence                           | Support/product     | Store submission                            |

Record completed evidence in `docs/evidence/staging-services-YYYY-MM-DD.md`, `docs/evidence/android-release-YYYY-MM-DD.md`, `docs/evidence/ios-release-YYYY-MM-DD.md`, `docs/evidence/payment-provider-YYYY-MM-DD.md`, and `docs/qr-poc/matrix.csv`.
