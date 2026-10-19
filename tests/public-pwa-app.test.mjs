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
  assert.match(layout, /manifest: locale === "en" \? "\/site-manifest-en\.webmanifest"/);
  assert.match(layout, /<PublicPwaRegister\s*\/>/);
  assert.match(layout, /<PublicPwaInstallPrompt locale=\{locale\}/);
  assert.match(installPrompt, /Add to Home Screen/);
  assert.match(installPrompt, /__raPublicInstallPrompt/);
});

test("public service worker uses a network-first navigation fallback without caching user data", () => {
  const worker = read("public/sw.js");

  assert.match(worker, /request\.mode !== "navigate"/);
  assert.match(worker, /\/\(fa\|en\)/);
  assert.match(worker, /fetch\(request\)\.catch/);
  assert.match(worker, /pwa-offline-fa\.html/);
  assert.match(worker, /pwa-offline-en\.html/);
  assert.doesNotMatch(worker, /cache\.put\(request/);
});

test("Android companion is configured as a branded, HTTPS-first Capacitor app", () => {
  const config = read("capacitor.config.ts");
  const pkg = JSON.parse(read("package.json"));
  const docs = read("docs/MOBILE-APP.md");

  assert.match(config, /appId: "com\.rosieatelier\.app"/);
  assert.match(config, /CAPACITOR_SERVER_URL/);
  assert.match(config, /parsedSiteUrl\.protocol !== "https:"/);
  assert.match(config, /\/fa\?source=android/);
  assert.equal(pkg.dependencies["@capacitor/core"], pkg.dependencies["@capacitor/android"]);
  assert.ok(pkg.scripts["android:apk:debug"]);
  assert.match(docs, /android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.match(docs, /JDK 17 or newer and Android SDK\/Build Tools 35/);
});
