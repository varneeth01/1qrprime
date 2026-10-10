# 1QR Prime premium UX implementation report

Date: 2026-10-09

## Implemented in this pass

- Added a documented platform design system in `docs/DESIGN_SYSTEM.md`.
- Added a screen-by-screen UX audit in `qa/ui/UX_AUDIT.md`.
- Added a branded authenticated-app bootstrap state with a restrained skeleton instead of a blank/spinner-only screen.
- Corrected the production environment badge on the canonical customer domain.
- Added an additive plan catalogue migration with a ₹599 Prime plan, active/recommended ordering fields, and future-plan metadata.
- Added `GET /api/plans` and an owner-only plan selection endpoint with audit logging and tenant authorization.
- Added a real plan-selection step at the end of new-business onboarding. Billing remains explicitly separate; selecting Prime does not claim that a charge occurred.
- Added the same plan-selection step to the native onboarding flow and surfaced the current plan price in the mobile account surface.
- Renamed the native payment-destination action to “Submit payment destination” while retaining the existing email and independent-verification gates.
- Added additive staff invitations with hashed, single-use 72-hour tokens, email delivery, acceptance UI, revocation, and permission snapshots.
- Added minimized successful-login activity records for web/native sessions and exposed safe login history in admin tenant detail.
- Added owner email approval for payment-route changes. Approval advances only to owner-approved; independent verification and activation remain separate.
- Added staff and payment-confirmation responsive web surfaces.

## Second-slice validation

- API/web/mobile typechecks: PASS
- API build: PASS
- Web build: PASS
- SQLite tests: PASS (33 passed in the current suite; 7 PostgreSQL suites skipped because no disposable PostgreSQL server is configured)
- Database inventory: PASS (0/0/0)
- Android release APK: built and installed on TECNO KN3; packaged `allowBackup=false` and `usesCleartextTraffic=false` verified with `aapt`.
- Android launch/logcat smoke: PASS; authenticated device QA remains pending manual sign-in.
- Replaced the payment-route browser prompt with an inline verification-reference form and changed the action language from “Save draft” to “Submit payment destination”.
- Added a regression test covering Prime pricing and persisted owner plan selection.

## Validation

- Typecheck: PASS
- API build: PASS
- Web build: PASS
- SQLite/API tests: 28 PASS, 7 PostgreSQL suites skipped without a disposable PostgreSQL server
- Database inventory: 0 synchronous reads, 0 synchronous writes, 0 synchronous transactions

## Known limitations / next implementation slices

- Permission enforcement is currently conservative: owner-only high-risk actions remain owner-only; granular manager permission checks should be expanded route-by-route before broad manager delegation.
- Admin overview metrics and full account filtering/pagination still need the planned operations-console information architecture pass.
- Payment confirmation email is implemented, but email delivery/provider QA remains environment-dependent.
- The native application has not yet received the full navigation, skeleton, and form-density redesign; its existing security and API contracts remain unchanged.
- Existing legacy `prompt`/`confirm` usage remains in unrelated category/table/admin/destructive flows and should be replaced by shared dialogs in a follow-up UI pass.

This report deliberately distinguishes implemented behavior from planned work; no billing success, staff invitation, or payment verification is simulated.

## Form performance device retest

- TECNO KN3 connected over ADB; corrected production release APK installed successfully.
- Production environment badge and onboarding screen loaded without a startup crash after building with `NODE_ENV=production`.
- Physical slug suggestion and submit-time validation were observed with screenshots under `qa/ui/screenshots/android-form-qa/`.
- Focused logcat scan after navigation showed no relevant application crash, ANR, ReactNativeJS, TLS, or skipped-frame output.
- Live slug availability feedback is pending deployment of the new API route; authenticated login and merchant-form performance remain pending disposable-session access.
# Final visual rebuild evidence

The active merchant renderer was visually rebuilt after identifying the legacy cascade as the reason the earlier slice did not visibly change the product. See `qa/ui/VISUAL_ROOT_CAUSE.md` and `qa/ui/FINAL_PRODUCT_UI_REPORT.md`.

Rendered evidence is stored under `qa/ui/final/`:

- Web: login, signup/onboarding, portfolio, orders, menu, tables, payments, staff, QR, profile, settings, and admin support console.
- Public: customer page and menu at mobile width.
- Android: launch/bootstrap, home, orders, menu, QR, and More at 720×1600.

The web CSS cascade is now a single tokenized system; the native app consumes `apps/mobile/theme.ts`. No deployment or push was performed.

## Final rebuild evidence

- Before baseline: `qa/ui/rebuild-before/`
- Web after: `qa/ui/rebuild-after/web/` and `contact-sheet.png`
- Android after: `qa/ui/rebuild-after/android/` and `contact-sheet.png`
- Public after: `qa/ui/rebuild-after/public/` and `contact-sheet.png`
- Admin after: `qa/ui/rebuild-after/admin/`

The admin evidence includes both the support-console overview and a searched
account detail view. The browser review also captured `web/plan.png` and
`web/customer-editor.png` for the plan and live customer-page editor surfaces.

The Android authenticated screen set is complete at 720×1600. Authenticated session state was preserved during this pass, so login/signup/plan use the prior physical form evidence rather than clearing app data. Final regression rerun: typecheck PASS, API tests 32 PASS with 7 PostgreSQL suites skipped, UI validation 3/3 PASS, API/web build PASS, and inventory 0/0/0.

## Commercial model slice

- Prime metadata now carries ₹1,599 reference price, ₹599/month launch price,
  eligible categories (`restaurant`, `cafe`, `hotel`), and a five-seat
  non-owner staff limit.
- Unsupported-category onboarding now presents a Custom callback path and uses
  the new sales-lead API instead of publishing the hospitality workflow.
- Razorpay order creation and signature verification endpoints are implemented
  server-side. They require environment credentials, determine price from the
  catalog, and activate a plan only after valid signature verification.
- Razorpay test checkout and the v3 billing/admin screenshot matrix remain
  pending because no test credentials are present in the current environment.
# Commercial implementation update

- Added Prime launch pricing presentation (₹1,599 reference → ₹599/month),
  supported-category gating, custom-category callback flow, and five-seat
  staff entitlement presentation.
- Added web Razorpay Standard Checkout loading and explicit pending/success/
  cancelled/failed/verification-failure states. Activation is only shown after
  backend verification.
- Added restricted admin billing operations with search/status filtering and
  sales-lead status operations.
- Rebuilt the current Android production APK through `npm run android:release`
  using NODE_ENV=production and NDK 27.0.12077973. Artifact SHA-256:
  `734d8a441d14767f0eb54f0169ff48d87908d87d0c0f59514b868dda90138d81`.
- Full Razorpay test-mode execution, authenticated Android commercial QA, and
  the complete v3 screenshot matrix remain pending.
