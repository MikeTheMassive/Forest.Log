const CACHE = "forest-log-v8";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png?v=2",
  "./icons/icon-512.png?v=2",
  "./icons/apple-touch-icon.png?v=2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cache the Leaflet library after first use so the app UI can reopen offline.
  // Do not cache third-party map/satellite tiles; those remain subject to provider terms.
  // Always check the network for page navigations so the clean main URL receives app updates.
  if (url.origin === self.location.origin && req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    if (url.hostname === "unpkg.com" || url.hostname === "cdn.jsdelivr.net") {
      event.respondWith(
        caches.match(req).then((cached) => cached || fetch(req).then((response) => {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
          return response;
        }))
      );
    }
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((response) => {
      const clone = response.clone();
      caches.open(CACHE).then((cache) => cache.put(req, clone));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});
