# Android UI root cause

## Actual rendered implementation

- Home: inline `tab === OwnerRoutes.Home` branch in `apps/mobile/App.tsx`.
- Orders: `NativeOrders` in `apps/mobile/App.tsx`.
- Menu: `NativeMenu` in `apps/mobile/App.tsx`.
- QR: `NativeQr` in `apps/mobile/App.tsx`.
- More: `MoreMenu` in `apps/mobile/App.tsx`.

There were no active `apps/mobile/screens/`, `apps/mobile/navigation/`, or `apps/mobile/components/` screen implementations. The active app was therefore still the monolithic inline renderer.

## Old styles still active

The active renderer used the original `StyleSheet.create` block in `App.tsx`: large generic cards, inline text navigation, green quick-action cards, a persistent `MERCHANT` header, and the old bottom bar. `theme.ts` was only a token source; it did not replace the rendered component structure.

## Installed APK state

The inspected device package was version `1.0.0`, version code `1`, installed at `2026-10-10 04:20:35`. The local release APK was built at `04:08:48`, while the current mobile source had later modifications (`App.tsx` at `05:04:38`, `theme.ts` at `04:17:26`). The installed package was therefore stale relative to the current working tree.

## Consequence

The user was seeing both an old active renderer and an APK that predated later mobile changes. Native UI changes cannot be accepted until a new production APK is built, installed, and visually checked on TECNO KN3.

## Current rebuild evidence

- Canonical production build completed with `NODE_ENV=production`, `EXPO_PUBLIC_ENVIRONMENT=production`, the production API/web origins, and NDK `27.0.12077973`.
- APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
- SHA-256: `1c55add08ab640e10697bd74d6f721f2e69af8dc724e09402ae223a7752d9ee8`.
- The APK was installed successfully on the TECNO KN3 at `2026-10-10 16:43:35`.
- Packaged manifest inspection confirmed `android:allowBackup="false"` and `android:usesCleartextTraffic="false"`; the release build does not carry a debuggable flag.
- The physical after-screen capture remains blocked because the device is currently displaying the lock/notification shade. Launch intents are delivered, but screenshots show the system shade rather than the application. No lock/security bypass was used.
