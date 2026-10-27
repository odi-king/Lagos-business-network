// Service worker: lets the app open fast and show its pages when the signal is weak.
// Bump CACHE_NAME whenever you push changes, so phones pick up the new files.
const CACHE_NAME = "lbn-v19";

const APP_FILES = [
    "./",
    "index.html",
    "auth.html",
    "dashboard.html",
    "marketplace.html",
    "pay.html",
    "reset.html",
    "admin.html",
    "classes.html",
    "class.html",
    "style.css",
    "auth.js",
    "dashboard.js",
    "script.js",
    "pay.js",
    "reset.js",
    "admin.js",
    "classes.js",
    "class.js",
    "membership.js",
    "video-utils.js",
    "badges.js",
    "trade.html",
    "trades.html",
    "trade.js",
    "trades.js",
    "contact.html",
    "contact.js",
    "paystack-config.js",
    "feed.html",
    "feed.js",
    "member.html",
    "member.js",
    "posts.js",
    "library.js",
    "library.html",
    "settings.js",
    "settings.html",
    "notifications.js",
    "notifications.html",
    "help.html",
    "appnav.js",
    "live.js",
    "live.html",
    "reels.js",
    "reels.html",
    "supabase-config.js",
    "pwa.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png"
];

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(APP_FILES);
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
                const copy = response.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(request, copy);
                });
                return response;
            })
            .catch(function () {
                return caches.match(request);
            })
    );
});