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
- Replaced the payment-route browser prompt with an inline verification-reference form and changed the action language from “Save draft” to “Submit payment destination”.
- Added a regression test covering Prime pricing and persisted owner plan selection.

## Validation

- Typecheck: PASS
- API build: PASS
- Web build: PASS
- SQLite/API tests: 28 PASS, 7 PostgreSQL suites skipped without a disposable PostgreSQL server
- Database inventory: 0 synchronous reads, 0 synchronous writes, 0 synchronous transactions

## Known limitations / next implementation slices

- Staff currently supports assigning an existing registered user. A complete expiring email invitation and acceptance flow still needs an additive invitation table, token lifecycle, mail template, and acceptance UI.
- Payment destination owner-email approval is not yet a separate workflow; existing email verification and independent route verification gates remain authoritative.
- Admin account detail and login-history presentation remains functional but needs the planned operations-console information architecture pass.
- The native application has not yet received the full navigation, skeleton, and form-density redesign; its existing security and API contracts remain unchanged.
- Existing legacy `prompt`/`confirm` usage remains in unrelated category/table/admin/destructive flows and should be replaced by shared dialogs in a follow-up UI pass.

This report deliberately distinguishes implemented behavior from planned work; no billing success, staff invitation, or payment verification is simulated.
