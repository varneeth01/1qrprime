# 1QR Prime friendly URL QA

## Route architecture

- Friendly business route: `/b/{slug}`. This is the human-readable public alias.
- Canonical customer/QR route: `/q/{publicId}`. QR artwork always encodes the immutable `publicId`.
- API public lookup: `/api/public/:slug`, resolving either the friendly slug or the immutable public ID.
- Table QR route: `/q/{publicId}?t={tableToken}`.
- `publicId` is generated once and must not change when the name, slug, menu, or profile changes.

## Web root cause

After registration, the web app refreshed `/me` but left a no-location account on the Portfolio section. The native app entered business setup directly, while the web app did not. This made the web onboarding flow appear broken. The refresh guard now routes accounts without a business into `NewLocation`.

The previous field also treated ordinary text as a raw slug regex failure. The client now keeps editing text smooth, normalizes it to a friendly alias, and checks the normalized value after a debounce.

## Normalization

Business names and manually entered URL text normalize deterministically:

`Café Prime !!!` → `cafe-prime`

`MY CAFE 2026` → `my-cafe-2026`

`Cafe_Prime` → `cafe-prime`

The API repeats normalization and enforces length, reserved-route, and uniqueness rules authoritatively.

## Evidence

- Android `Cafe Prime` produced `cafe-prime` with no technical validation copy.
- Local web onboarding produced `cafe-prime` and sent one debounced availability request.
- Local full web onboarding published `Cafe Prime QA`; public ID remained separate.
- `/api/public/cafe-prime-qa` returned 200.
- `/api/public/cafe-prime-qa/qr?format=svg` returned 200.

Production availability behavior remains deployment-dependent until the API route is redeployed.
