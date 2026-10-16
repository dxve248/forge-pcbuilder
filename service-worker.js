// ForgePC service worker: network-first for HTML, cache-first for the rest,
// never caching the /api/prices endpoint so price syncs aren't stale.

// Bump this single constant whenever shipped assets change; the activate
// handler purges every cache that doesn't match the new name.
const VERSION = 'v2';
const CACHE = `forgepc-${VERSION}`;
const API_PREFIX = '/api/prices';

// App shell precached on install so the builder opens offline.
const PRECACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/main.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) {
    fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(API_PREFIX)) return; // live prices, never cached

  const html = url.pathname === '/' || url.pathname.endsWith('.html');
  event.respondWith(html ? networkFirst(request) : cacheFirst(request));
});
