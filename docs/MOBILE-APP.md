# Rosie Admin Android app

This project contains a dedicated Android companion for the private Rosie Atelier administration panel. It opens the real admin sign-in page, not the public storefront:

- Start page: `/admin/fa/login?source=android`
- Android application ID: `com.rosieatelier.admin`
- App label: **پنل مدیریت رزی** / **Rosie Admin**
- Version: `1.0.0`

The APK uses the deployed Next.js application over HTTPS. It does not contain an admin password, bypass authentication, or store protected admin records for offline use. Sign in with an account whose server-side role is `admin`; the same authenticated admin APIs and permission checks used by the website remain in force. An internet connection and a valid HTTPS deployment are required.

## Build an installable debug APK

Local build requirements: Node.js 20+, JDK 21+, Android SDK platform 35, and Android Build Tools 35.0.0.

```sh
export CAPACITOR_SERVER_URL="https://rosieatelier.com"
npm ci
npm run android:apk:debug
```

`CAPACITOR_SERVER_URL` is the deployment origin, not an admin page URL. The Capacitor config appends `/admin/fa/login?source=android`. If no override is provided, the project uses `https://rosieatelier.com`; verify that the domain is the live production site before distributing the APK. Never build a release APK against localhost or a temporary preview URL.

The installable debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The debug build is signed with Android's standard debug key for sideload/testing; it is not a Play Store release. To install, transfer the APK to the Android device, allow installation from that file source when prompted, and open **پنل مدیریت رزی**. The first launch goes to the admin sign-in page.

## Build with GitHub Actions

The `Rosie Admin Android APK` workflow runs on pushes to `arena/18302fe2-razi` and can be started manually with a production HTTPS origin. It publishes a 14-day artifact named `rosie-admin-android-debug`. The workflow uses JDK 21 and Android API/Build Tools 35, so the APK can be produced even when a developer machine does not have Android tooling installed.

## Security and release notes

- HTTPS is required by default. Cleartext HTTP is only allowed for local device testing when `CAPACITOR_ALLOW_CLEARTEXT=1` is explicitly set; never use that option for a distributed APK.
- Android backup is disabled so WebView session data is not included in device/cloud backup. The app still retains its session locally on the device according to the server's cookie policy.
- Admin pages and API responses are not cached for offline access. If the connection is unavailable, the app shows a retry screen rather than stale customer or financial data.
- The launcher icon and splash screen use Rosie Atelier branding with a distinct admin badge.
- For future Play Store or public release builds, configure a durable private signing key in the CI secret store and build a signed release APK/AAB. Do not commit signing keys, passwords, or keystores to Git. Keep the same signing key for future updates.

## PWA option

The admin PWA remains available in mobile Chrome and Safari. It is useful when browser-based installation or web-push notifications are preferred; see [`MOBILE-ADMIN-PWA.md`](../MOBILE-ADMIN-PWA.md). The native APK is the dedicated Android shortcut for managing the same online admin console.
