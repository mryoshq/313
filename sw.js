"use strict";

// Bump the version whenever a cached app file changes.
const CACHE_PREFIX = "harmonics:" + self.registration.scope + ":";
const CACHE_NAME = CACHE_PREFIX + "v7";
const APP_URL = new URL("harmonics.html", self.registration.scope).href;
const SHELL = [
  "harmonics.html", "index.html", "synthesis.js", "pwa.js", "share.js", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"
].map(path => new URL(path, self.registration.scope).href);
const NAVIGATIONS = new Set([APP_URL, self.registration.scope, new URL("index.html", self.registration.scope).href]);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(SHELL.map(url => new Request(url, { cache: "reload" })))
  ));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  url.hash = "";
  if (url.origin !== self.location.origin) return;
  const navigation = event.request.mode === "navigate" && NAVIGATIONS.has(url.href);
  if (!navigation && !SHELL.includes(url.href)) return;
  const cacheKey = navigation ? APP_URL : url.href;
  // Keep each app version together. Updates activate only after the user's choice.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cacheKey);
    return cached || fetch(event.request);
  })());
});
