import type { CapacitorConfig } from "@capacitor/cli";

// The admin console uses authenticated server routes and APIs, so the Android
// app opens the deployed HTTPS admin login instead of bundling a static export.
// Override this with CAPACITOR_SERVER_URL when building for another domain.
const siteUrl = (
  process.env.CAPACITOR_SERVER_URL
  ?? process.env.NEXT_PUBLIC_SITE_URL
  ?? "https://rosieatelier.com"
).trim().replace(/\/$/, "");

let parsedSiteUrl: URL;
try {
  parsedSiteUrl = new URL(siteUrl);
} catch {
  throw new Error("CAPACITOR_SERVER_URL must be a valid absolute URL");
}

const allowCleartext = process.env.CAPACITOR_ALLOW_CLEARTEXT === "1";
const siteHost = parsedSiteUrl.hostname.replace(/^www\./, "");
if (parsedSiteUrl.protocol !== "https:" && !allowCleartext) {
  throw new Error("The Android app requires HTTPS. For local device testing only, set CAPACITOR_ALLOW_CLEARTEXT=1.");
}

const config: CapacitorConfig = {
  appId: "com.rosieatelier.admin",
  appName: "Rosie Atelier Admin",
  webDir: "capacitor-web",
  server: {
    // Start directly at admin sign-in; an existing admin session lands in the console.
    // Keep CAPACITOR_SERVER_URL pointed at the actual production deployment.
    url: new URL("/admin/fa/login?source=android", parsedSiteUrl).toString(),
    cleartext: allowCleartext,
    allowNavigation: [siteHost, `*.${siteHost}`],
    errorPath: "offline.html",
  },
};

export default config;
