# Android release build

Build the production APK from the repository root with:

```sh
npm run android:release
```

The script sets and verifies the complete production mobile configuration:

- `NODE_ENV=production`
- `EXPO_PUBLIC_ENVIRONMENT=production`
- `EXPO_PUBLIC_API_URL=https://api.1qrprime.com/api`
- `EXPO_PUBLIC_WEB_ORIGIN=https://1qrprime.com`

It also requires NDK `27.0.12077973` and fails before Gradle bundling if the
required NDK or production environment is unavailable. The installable APK is
written to `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
