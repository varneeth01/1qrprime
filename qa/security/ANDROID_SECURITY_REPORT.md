# 1QR Prime Android Security Report

Date: 2026-10-09

## Device and package

- Device: TECNO KN3
- Android: 15 / SDK 35
- Resolution: 720x1600
- Density: 280
- Package: `in.oneqr.prime`
- Installed version: 1.0.0 / versionCode 1
- Installed update time: 2026-10-09 14:01:51 local device time

## Static checks

- Production API source enforcement requires `https://api.1qrprime.com/api`.
- Production web origin source enforcement requires `https://1qrprime.com`.
- Session token is stored through `expo-secure-store`; no AsyncStorage usage was found.
- No application source logs session tokens.
- Release package target SDK is 36.
- No `debuggable` flag was present in the release manifest inspection.
- The pre-existing merged release manifest had `allowBackup=true` and `usesCleartextTraffic=true`. This is a release hardening finding.
- A tracked Expo config plugin now enforces both values as false. The final packaged APK could not be rebuilt after Expo prebuild because this workstation lacks NDK `27.0.12077973`; the generated native project was not committed.

## Runtime checks

- ADB device detected: PASS.
- Package path detected: PASS.
- Force-stop/launch command resolved `.MainActivity`.
- The phone was on the Android lock screen during this run; authenticated UI navigation, token lifecycle, deep links and screen-by-screen QA were not executed.
- No app-specific fatal exception, ANR, SSL handshake, cleartext, loopback or tunnel hit was found in the captured logcat for the launch attempt.

## Required follow-up

Rebuild the release APK on a workstation with the pinned Android NDK, inspect the packaged manifest again, install it on TECNO KN3, unlock the device, and run the authenticated acceptance matrix. Do not treat the source config change alone as a packaged-APK PASS.

## Continuation update — 2026-10-09

- Device is now awake/unlocked: TECNO KN3, Android 15 / SDK 35, 720x1600, density 280.
- Existing installed app launches successfully to the production-branded sign-in screen and shows the `PRODUCTION` indicator. No app-specific loopback/tunnel/SSL error was observed in the captured launch log.
- Authenticated QA remains not executed: there is no retained disposable session or credential available, and no credentials were logged or entered automatically.
- A fresh APK rebuild was attempted after Expo prebuild with the Android security plugin. It was blocked by unavailable local build tools/NDK provisioning; the installed APK therefore remains the pre-hardening artifact.

## Toolchain continuation — 2026-10-09

- A user-owned Android SDK is available at `~/Android/Sdk` with platform 36 and build-tools 36.1.0. The repository’s configured NDK `27.0.12077973` is not installed locally.
- The installed SDK contains NDK 26.1.10909125. A local-only build attempt using that NDK reached native compilation but failed in React Native 0.86 C++ (`std::format` in `graphicsConversions.h`); no APK was produced.
- Installing the exact NDK from `dl.google.com` was attempted through `sdkmanager` but the download stalled and was interrupted. No repository configuration was changed for this experiment; generated Android files remain ignored/local.
- Therefore APK hardening is still **not verified in a newly built artifact**. A workstation with the configured NDK or a functioning Android SDK download path is required before installation and authenticated QA.
