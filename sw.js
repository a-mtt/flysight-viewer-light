// Offline support. Network first, so an online visit always gets the latest
// files; each response is also cached so the app opens without a connection
// (e.g. at the dropzone). Track files are read locally and never touch this.
const CACHE = "flysight-viewer";
const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "parser.js",
  "scoring.js",
  "app.js",
  "vendor/uPlot.iife.min.js",
  "vendor/uPlot.min.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      // Offline: same file from the cache, ignoring the ?v= version.
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
