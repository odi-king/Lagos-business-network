// Service worker: lets the app open fast and show its pages when the signal is weak.
// Bump CACHE_NAME whenever you push changes, so phones pick up the new files.
const CACHE_NAME = "lbn-v62";

// Only a few core files are saved up front. Every other page is saved the first time it is opened.
// (Saving about 100 files at once made GitHub Pages block heavy testing.)
const APP_FILES = [
    "./",
    "index.html",
    "style.css",
    "supabase-config.js",
    "appnav.js",
    "pwa.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png"
];

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            // One file at a time: a single missing file must never stop the whole update
            return Promise.all(APP_FILES.map(function (url) {
                return cache.add(url).catch(function () { /* skip this file, the rest still cache */ });
            }));
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names
                    .filter(function (name) { return name !== CACHE_NAME; })
                    .map(function (name) { return caches.delete(name); })
            );
        })
    );
    self.clients.claim();
});

// Network first, and always checked with the server, so people get your latest files
// right after you push. The saved copy is only the backup for weak signal.
// Supabase, Paystack and other outside sites are never touched, so logins and payments stay live.
self.addEventListener("fetch", function (event) {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(request, { cache: "no-cache" })
            .then(function (response) {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(request, copy);
                    });
                }
                return response;
            })
            .catch(function () {
                return caches.match(request);
            })
    );
});
