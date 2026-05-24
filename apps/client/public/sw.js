const CACHE_NAME = 'peerdash-shell-v5';

// These are the static shell assets. JS/CSS hashed filenames are
// added dynamically on first fetch via the stale-while-revalidate handler.
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/peerdash-icon.svg',
  '/sw.js',
];

// ── Install: pre-cache the shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: evict old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => clients.claim())
  );
});

// ── Fetch: cache-first for assets, network-first for navigation ───────────────
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip socket.io / signalling WebSocket upgrades
  if (url.pathname.startsWith('/socket.io')) return;

  // Navigation requests: network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a fresh copy of the HTML shell
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || caches.match(request))
        )
    );
    return;
  }

  // JS / CSS / images / fonts: cache-first, then network, store in cache
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          // Only cache successful, non-opaque responses
          if (response && response.status === 200 && response.type !== 'opaque') {
            cache.put(request, response.clone());
          }
          return response;
        });
      })
    )
  );
});
