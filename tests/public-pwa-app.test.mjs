import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("public locale routes expose localized install manifests and install prompt UI", () => {
  const persianManifest = JSON.parse(read("public/site-manifest-fa.webmanifest"));
  const englishManifest = JSON.parse(read("public/site-manifest-en.webmanifest"));
  const layout = read("src/app/[locale]/layout.tsx");
  const installPrompt = read("src/components/pwa/PublicPwaInstallPrompt.tsx");

  assert.equal(persianManifest.start_url, "/fa?source=pwa");
  assert.equal(englishManifest.start_url, "/en?source=pwa");
  for (const manifest of [persianManifest, englishManifest]) {
    assert.equal(manifest.scope, "/");
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  }
  assert.ok(layout.includes('manifest: locale === "en" ? "/site-manifest-en.webmanifest"'));
  assert.ok(layout.includes("<PublicPwaRegister />"));
  assert.ok(layout.includes("<PublicPwaInstallPrompt locale={locale}"));
  assert.ok(installPrompt.includes("Add to Home Screen"));
  assert.ok(installPrompt.includes("__raPublicInstallPrompt"));
});

test("public service worker uses a network-first navigation fallback without caching user data", () => {
  const worker = read("public/sw.js");

  assert.ok(worker.includes('request.mode !== "navigate"'));
  assert.ok(worker.includes("/(fa|en)"));
  assert.ok(worker.includes("fetch(request).catch"));
  assert.ok(worker.includes("pwa-offline-fa.html"));
  assert.ok(worker.includes("pwa-offline-en.html"));
  assert.ok(!worker.includes("cache.put(request"));
});

test("Android APK opens the secured admin console with dedicated branding", () => {
  const config = read("capacitor.config.ts");
  const pkg = JSON.parse(read("package.json"));
  const docs = read("docs/MOBILE-APP.md");
  const gradle = read("android/app/build.gradle");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const strings = read("android/app/src/main/res/values/strings.xml");
  const workflow = read(".github/workflows/android-debug-apk.yml");

  assert.ok(config.includes('appId: "com.rosieatelier.admin"'));
  assert.ok(config.includes('appName: "Rosie Atelier Admin"'));
  assert.ok(config.includes("CAPACITOR_SERVER_URL"));
  assert.ok(config.includes('parsedSiteUrl.protocol !== "https:"'));
  assert.ok(config.includes("/admin/fa/login?source=android"));
  assert.ok(gradle.includes('applicationId "com.rosieatelier.admin"'));
  assert.ok(manifest.includes('android:allowBackup="false"'));
  assert.ok(strings.includes("پنل مدیریت رزی"));
  assert.equal(pkg.dependencies["@capacitor/core"], pkg.dependencies["@capacitor/android"]);
  assert.ok(pkg.scripts["android:apk:debug"]);
  assert.ok(docs.includes("android/app/build/outputs/apk/debug/app-debug.apk"));
  assert.ok(docs.includes("JDK 21+"));
  assert.ok(docs.includes("Android Build Tools 35.0.0"));
  assert.match(docs, /admin sign-in page/i);
  assert.ok(workflow.includes("name: rosie-admin-android-debug"));
});
