# Form interaction performance report

## Before

- The web login form relied on native constraints and uncontrolled fields, so browser invalid styling could appear before the user had completed a value.
- The onboarding slug field rewrote text on every keypress and carried a native `pattern`, making partial values feel invalid and preventing calm manual editing.
- Mobile forms already kept most drafts local, but the mobile slug field had no touched/submit distinction and the login error remained visible after a credential edit.

## Changes

- Added shared web helpers for slug normalization, slug format validation, email validation, and password validation.
- Added touched/blur/submit-aware login validation and server-error clearing on edit.
- Added business-name slug suggestion generation with a manual-edit boundary.
- Added a 500ms authenticated slug availability check with request sequencing so old responses cannot overwrite newer values.
- Added mobile slug normalization, deferred field messaging, production-friendly network copy, and login error clearing.
- Kept mutation requests on explicit Save/Submit/Publish actions.

## Expected after behavior

- No authentication request is made while typing.
- Normal typing produces no red invalid state.
- The slug preview remains stable while the user edits.
- Only a settled, locally valid slug triggers the debounced availability read.
- Background availability checks do not replace the active form or block input.

## Current Android build attempt

- Production-configured release APK rebuilt successfully with NDK `27.0.12077973`.
- APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- SHA-256: `e149e5b88e8bc7508e154a97f5094a238136033c9329e9b809fa898b9baac794`
- Packaged manifest: `in.oneqr.prime`, `allowBackup=false`, `usesCleartextTraffic=false`.
- Physical installation and rapid-typing/logcat QA are pending because `adb devices` currently reports no connected device.

## Physical TECNO KN3 retest

- APK rebuilt with `NODE_ENV=production` and the three production `EXPO_PUBLIC_*` values; the corrected APK launches on TECNO KN3 without the earlier missing-environment crash.
- Business-name typing produced the `cafe-prime` suggestion immediately; the slug remained stable while editing and did not show an error before submit.
- Invalid slug submission displayed `Use lowercase letters, numbers and single hyphens only.` as an inline message.
- Native availability is implemented with a 500ms debounce and request sequencing, but the installed app points to the currently deployed API. The new `/locations/slug-availability` route is not deployed, so live `Available`/`Unavailable` feedback could not be observed.
- Navigation smoke screenshots were captured for Orders, Menu, QR, and More. No relevant crash, ANR, ReactNativeJS, TLS, or frame-skipping messages appeared in the focused logcat scan.
- Login, authenticated profile/staff/payment typing, unsaved-draft preservation, and 409 regression require an authenticated disposable session and were not claimed from this run.
