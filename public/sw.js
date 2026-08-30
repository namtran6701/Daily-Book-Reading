// Second Brain service worker: offline app shell + fast static assets.
// Bump CACHE when the shell or this file changes to evict the old cache.
const CACHE = "second-brain-v13";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/animated.svg",
  "/icon.svg",
  "/fonts/fraunces-var.woff2",
  "/fonts/fraunces-var-italic.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Data is always live: never cache the API, just let it hit the network.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first so the app updates, cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only cache a real, same-origin 200 as the shell. Skip errors (500)
          // and redirected responses (e.g. an Access login page) so the offline
          // shell can't be poisoned. waitUntil keeps the write alive.
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put("/", copy)));
          }
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets (hashed JS/CSS, images, svg): cache-first, refresh in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
