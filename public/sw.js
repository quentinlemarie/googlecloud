/// Service Worker – offline-first caching for the Smart Transcription PWA.
///
/// Strategy
/// ─────────────────────────────────────────────────────────────────────────
/// • **App shell** (index.html, JS/CSS bundles, icons) → cache-first.
/// • **Navigation requests** → network-first, falling back to the cached
///   index.html so the SPA can still boot offline.
/// • **Google APIs** (accounts.google.com, apis.google.com) and the Gemini /
///   Cloud Storage endpoints are never cached – they always go to the network.
/// ─────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'smart-transcription-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately instead of waiting for existing tabs to close.
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  // Remove old caches from previous versions.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  // Start controlling all open tabs immediately.
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache cross-origin Google API / auth requests.
  const bypassOrigins = new Set([
    'https://accounts.google.com',
    'https://apis.google.com',
    'https://generativelanguage.googleapis.com',
    'https://storage.googleapis.com',
    'https://www.googleapis.com',
  ]);
  if (bypassOrigins.has(url.origin)) {
    return;
  }

  // HTML navigation → network-first, fallback to cached index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the latest navigation response for offline use.
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then(
            (cached) => cached || new Response('Offline – please reconnect and try again.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          )
        )
    );
    return;
  }

  // Everything else (JS, CSS, images) → cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache successful same-origin responses.
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
