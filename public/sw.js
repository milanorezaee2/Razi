/* Public-site PWA worker: never stores personalized pages or API responses. */
const CACHE_NAME = "razi-public-offline-v1";
const OFFLINE_PAGES = ["/pwa-offline-fa.html", "/pwa-offline-en.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_PAGES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("razi-public-offline-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !/^\/(fa|en)(\/|$)/.test(url.pathname)) return;

  // Keep all account and commerce data online-only; serve a static notice only
  // when a public page cannot be reached at all.
  const offlinePage = url.pathname.startsWith("/en") ? OFFLINE_PAGES[1] : OFFLINE_PAGES[0];
  event.respondWith(
    fetch(request).catch(async () => (await caches.match(offlinePage)) || Response.error()),
  );
});
