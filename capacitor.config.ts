import type { CapacitorConfig } from "@capacitor/cli";

// The Next.js app uses server routes and authenticated APIs, so an Android
// companion must load the deployed HTTPS site rather than a static export.
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
  appId: "com.rosieatelier.app",
  appName: "Rosie Atelier",
  webDir: "capacitor-web",
  server: {
    // This is a remote-webview companion for the online Next.js service.
    // Keep CAPACITOR_SERVER_URL pointed at the actual production deployment.
    url: new URL("/fa?source=android", parsedSiteUrl).toString(),
    cleartext: allowCleartext,
    allowNavigation: [siteHost, `*.${siteHost}`],
    errorPath: "offline.html",
  },
};

export default config;
