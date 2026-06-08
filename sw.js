/* Service worker for Dance Now! — offline support that stays fresh.

   Strategy:
   - HTML/navigations: network-first (always get the latest page when online,
     fall back to cache when offline). This prevents stale "old version" loads.
   - Other assets: cache-first, then network (and cache the result).
   The install is resilient: one missing file can't block the update. */

const CACHE = "dancenow-v7";
const ASSETS = [
  "index.html",
  "app.js",
  "pose.js",
  "camera-game.js",
  "avatars.js",
  "girl.svg",
  "boy.svg",
  "icon.svg",
  "manifest.webmanifest",
  "app-icon-180.png",
  "app-icon-192.png",
  "app-icon-512.png",
];

self.addEventListener("install", (e) => {
  // Resilient precache: don't let a single failed asset wedge the update.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const accept = req.headers.get("accept") || "";
  const isHtml = req.mode === "navigate" || accept.includes("text/html");

  if (isHtml) {
    // Network-first so the page is always up to date when online.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
    return;
  }

  // Other assets: cache-first, then network (and cache it).
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit)
    )
  );
});
