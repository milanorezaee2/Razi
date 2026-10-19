# Rosie Atelier installable app

The public website can be installed as a PWA on supported phones and computers. The Android companion is a Capacitor WebView shell that opens the deployed Next.js app; it is online-first because the application relies on authenticated server routes, commerce APIs, and server-rendered pages.

## Public PWA

- Locale-specific manifests are served at `/site-manifest-fa.webmanifest` and `/site-manifest-en.webmanifest`.
- The public service worker is `/sw.js`. It only provides a network-first navigation fallback for `/fa` and `/en`; it does not cache account pages, checkout, APIs, or admin data.
- On Android/desktop Chrome, use the browser's **Install app** action. On iPhone/iPad, use **Share → Add to Home Screen**.
- The existing admin PWA remains separate, scoped to `/admin/`.

## Android APK

The Capacitor Android project loads the live Next.js origin. Set the exact deployment origin before syncing/building:

```sh
export CAPACITOR_SERVER_URL="https://your-production-domain.example"
npm install
npx cap sync android
npm run android:apk:debug
```

`CAPACITOR_SERVER_URL` takes precedence over `NEXT_PUBLIC_SITE_URL`; if neither is set, the config defaults to `https://rosieatelier.com`. Confirm that this is the deployed domain before distributing an APK. Do not point a release APK at localhost or the temporary Arena preview URL.

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. The branch-specific GitHub Actions workflow also builds it after a push and publishes a 14-day downloadable artifact named `rosie-atelier-android-debug`; its manual trigger accepts a `site_url` input. For a release, configure a private Android signing key outside the repository and sign the bundle/APK; never commit keystores or passwords. A release also needs the production domain, HTTPS, and working OAuth/payment redirects.

Capacitor loads the remote site because this Next.js app uses server-side APIs and is not a static export. Therefore the Android app requires an internet connection and the site must be deployed. Local APK compilation requires JDK 17 or newer and Android SDK/Build Tools 35; machines without those tools can still build/test the PWA and prepare the Android project, but cannot produce the APK locally.

For local device testing only, an HTTP development server can be selected with `CAPACITOR_SERVER_URL=http://<LAN-IP>:3000` and `CAPACITOR_ALLOW_CLEARTEXT=1`. Never enable cleartext traffic for a release build.
