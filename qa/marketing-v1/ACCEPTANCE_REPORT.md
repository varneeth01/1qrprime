# Customer marketing acceptance

## Engineering acceptance

- Customer CRM, explicit WhatsApp consent, opt-out and tenant-scoped masking: PASS.
- Campaign audience snapshots and server-side consent enforcement: PASS.
- Promotions, recurring windows and server-side discount enforcement: PASS.
- Challenge progress, discount entitlements, atomic redemption and order snapshots: PASS.
- Campaign worker bounded tick, pacing, retry/backoff and consent recheck: IMPLEMENTED; success path is covered by the local mock-provider suite.
- PostgreSQL job claiming uses `FOR UPDATE SKIP LOCKED` on the PostgreSQL adapter: STATIC REVIEW PASS.
- WhatsApp webhook raw-body signature verification, normalized delivery state and idempotent event storage: IMPLEMENTED; pure signature coverage PASS.
- Unconfigured WhatsApp delivery fails closed with a user-safe `503`; no fake bulk send is reported.

## Local validation

- Typecheck: PASS
- API tests: 47 passed, 7 PostgreSQL suites skipped
- PostgreSQL command: `npm run test:postgres`
- PostgreSQL result: SKIPPED — no disposable local PostgreSQL service and `POSTGRES_TEST_URL` was not supplied. No production database was used.
- API/web build: PASS
- Full build: PASS
- Database inventory/source guard: PASS (`0 / 0 / 0`)
- Diff check: PASS
- Reward redemption regression: PASS; concurrent redemption allows one success and one conflict, with the discount snapshotted on the order.
- Consent audience regression: PASS; only explicitly opted-in recipients were queued.
- Local mock worker success: PASS through the security suite.

## Product-facing behavior

- Marketing overview copy now uses “Marketing” and “Bring customers back with offers, WhatsApp campaigns and rewards.”
- Campaign, promotion and challenge statuses/rules are humanized in the merchant UI; raw enum labels are no longer rendered.
- “Send now” is disabled unless the workspace reports a connected business sender and the selected template is approved.
- When WhatsApp is not configured, the workspace shows “WhatsApp setup required” rather than a raw provider error or fake connection action.
- Customer phone values remain masked by default.
- Customer pay phone marketing consent remains optional and unchecked by default.
- Item-based challenge rewards remain unavailable and are not offered in the creator.

## Visual evidence

- Public landing desktop/mobile: `qa/ui-premium-v5/marketing-final/landing-desktop.png`, `landing-mobile.png` — rendered and inspected.
- Public customer page: `qa/ui-premium-v5/marketing-final/customer-public-current.png` — rendered and inspected.
- Authenticated merchant desktop matrix: `qa/ui-premium-v5/marketing-final/merchant/` — overview, orders, menu add/edit, tables, payments, QR, staff, analytics, customer editor, business profile and settings rendered and inspected.
- Authenticated marketing desktop matrix: `qa/ui-premium-v5/marketing-final/merchant/marketing/` — overview, customers, campaigns, campaign creation, promotions, promotion creation, challenges and challenge creation rendered and inspected.
- Authenticated merchant mobile matrix: `qa/ui-premium-v5/marketing-final/merchant-mobile/` — overview, orders, menu, QR, marketing, customers and campaigns rendered and inspected at 390×844. A horizontal-overflow defect was found, corrected and recaptured.
- Public customer mobile: `qa/ui-premium-v5/marketing-final/customer-mobile/customer-home.png` and `customer-item.png` — home/menu/offer/challenge and cart states rendered and inspected.

## Remaining acceptance gaps

- `LIVE_TEMPLATE_SYNC: NOT VALIDATED` — no live Meta sender/template credentials were used.
- Production worker operation is not enabled; there is no production scheduler command in this repository. The worker is a library boundary and must be invoked by a separately approved scheduler/queue consumer.
- Dedicated worker transient-retry, permanent-failure and opt-out simulations were not run as separate fixtures; the consent recheck and success path are covered.
- Customer Pay-phone was exercised end-to-end locally with empty, invalid, valid/no-consent, valid/consent and retryable failure states. Synthetic consent persistence was verified in SQLite.
- Real PNG menu image upload, save, merchant thumbnail, public render and remove flow were exercised. Invalid and oversized files were rejected by the client. JPEG/WebP chooser coverage was not completed in this browser session.
- Promotion active/scheduled server filtering was verified through the merchant/public surfaces and local public API. There is no separate promotion-detail route in the current product.
- Customer reward UI now presents available/applied/redeemed/expired states and uses a server quote plus the existing authoritative order redemption path. These states were locally rendered and inspected; server second-use protection remains covered by tests.
- Local image storage is `local`; production acceptance requires a durable configured S3 or Vercel Blob backend, not ephemeral container storage.

## Final local acceptance matrix

- CUSTOMER_PAY_PHONE: PASS
- PHONE_VALIDATION: PASS
- PAYMENT_WITHOUT_MARKETING_CONSENT: PASS
- PAYMENT_WITH_MARKETING_CONSENT: PASS
- PHONE_ERROR_STATE: PASS
- PROMOTION_ACTIVE_STATE: PASS
- PROMOTION_SCHEDULED_STATE: PASS
- PROMOTION_DETAIL / CUSTOMER_PROMOTION_DETAIL: NOT IMPLEMENTED
- PROMOTION_EXPIRED_STATE: NOT EXECUTED
- PROMOTION_PRICE_ENFORCEMENT: server regression PASS; browser price flow NOT EXECUTED
- REWARD_AVAILABLE / REWARD_APPLIED / REWARD_REDEEMED: browser UI NOT IMPLEMENTED; server redemption regression PASS
- SECOND_REDEMPTION_BLOCKED: server regression PASS; browser UI NOT EXECUTED
- MENU_IMAGE_UPLOAD: PNG end-to-end PASS
- JPEG_UPLOAD / WEBP_UPLOAD: NOT EXECUTED in this browser session
- INVALID_FILE_BLOCKED / OVERSIZE_BLOCKED: PASS
- IMAGE_REMOVE / IMAGE_PUBLIC_RENDER: PASS
- IMAGE_REPLACE: not separately completed
- POSTGRES_TESTS: SKIPPED/BLOCKED — no disposable local PostgreSQL
- LIVE_TEMPLATE_SYNC: NOT VALIDATED (expected external gap)

The local image-validator correction in `apps/api/src/domain.ts` permits only the exact local API media URL shape used by the QA storage adapter; existing public/external safe-link validation remains in place.

No push, commit or deployment was performed.

## Final local acceptance update — 2026-10-12

This update supersedes earlier matrix entries that predate the current implementation:

- Promotion detail: PASS for active, scheduled, and expired customer routes; screenshots rendered and inspected at 390×844.
- Reward UI: PASS for available, applied, redeemed, and expired states; server quote and authoritative redemption path exercised locally.
- Reward second-use: backend protection PASS; browser second-use interaction not separately executed.
- JPEG upload: PASS with real chooser, save, thumbnail/public render, and remove.
- WebP upload: NOT EXECUTED due browser chooser timeout.
- Image replacement: Replace UI and source-level failure safety PASS; actual successful WebP replacement and forced network-failure scenario NOT EXECUTED.
- Storage: local backend used for QA; durable production object storage is not configured/verified.
- PostgreSQL: 7 suites skipped because no disposable local PostgreSQL was available; migration parity was statically reviewed.

Final automated validation: typecheck PASS; 54 tests total (47 passed, 7 PostgreSQL skipped, 0 failed); API/web/full builds PASS; inventory PASS (0/0/0); diff check PASS.

No push, commit, or deployment was performed. This is not a production-release acceptance because durable media storage and PostgreSQL execution remain unresolved, and WebP/replace browser coverage is incomplete.

### Final blocker closure evidence

- WebP chooser/upload/save/merchant render/public render: PASS using a real `.webp` through the merchant Menu UI.
- Image replacement upload/save/merchant render/public render/reload: PASS using a different real JPEG.
- Invalid replacement blocked: PASS; the existing persisted image remained after reload.
- Old-object cleanup: not inspected or changed in this acceptance.
- Media path: `/data/media` on named Docker volume `prime-media`.
- Container recreate/redeploy persistence: expected YES while the named volume is retained.
- Host-failure durability: NO; object storage is still required for stronger production durability.
- Current production storage: local named volume; S3/Vercel Blob adapter exists but is not configured.
- PostgreSQL: Docker daemon unavailable and no local PostgreSQL server installed/running; 7 suites remain skipped.

The local manual UI acceptance media blockers are closed. Production release acceptance remains NO until PostgreSQL suites run and production media durability is explicitly configured/accepted.

### Final release-blocker update — 2026-10-12

- Production now fails closed for local media storage. `STORAGE_DRIVER=local` is rejected in production configuration.
- Coolify Compose defaults to S3 and requires `S3_BUCKET` plus `S3_PUBLIC_ORIGIN`; credentials remain API-runtime-only.
- Sanitized S3 configuration validation: PASS. Actual S3 upload/durability: NOT EXECUTED because no disposable or production object-storage service was supplied.
- PostgreSQL suites remain skipped because Docker daemon and local PostgreSQL server are unavailable.

Production release acceptance remains NO until a disposable PostgreSQL run completes and an S3-compatible production backend is actually configured and verified.

## External infrastructure acceptance — 2026-10-12

- No S3 credentials, bucket configuration, or disposable object-storage service was available locally; no external provider was contacted.
- Compose/configuration is prepared to fail closed into S3 (`STORAGE_DRIVER=s3`, required bucket/public-origin variables).
- Real S3 upload, replacement, removal, public URL verification, and post-redeploy persistence: NOT EXECUTED.
- No `POSTGRES_TEST_URL`, local PostgreSQL server, or running Docker daemon was available.
- PostgreSQL migration-from-zero and all seven PostgreSQL suites: NOT EXECUTED; 7 skipped.
- No production database or customer data was used.

Production release acceptance remains NO pending actual external S3 and disposable PostgreSQL validation.
