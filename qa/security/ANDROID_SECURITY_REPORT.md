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
