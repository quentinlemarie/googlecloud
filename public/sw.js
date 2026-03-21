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

// Dedicated cache for files received via the Web Share Target API.
const SHARE_CACHE = 'share-target-audio';

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
  // Remove old caches from previous versions, but keep the share-target cache.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== SHARE_CACHE)
          .map((n) => caches.delete(n))
      )
    )
  );
  // Start controlling all open tabs immediately.
  self.clients.claim();
});

// ── Share Target (Web Share Target API) ──────────────────────────────────────
// When the PWA receives a shared file (e.g. from iPhone Voice Memos), the OS
// sends a POST to /share-target.  We stash the first audio/video file in a
// dedicated cache so the app can pick it up on the next page load.

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Handle incoming share-target POST ──────────────────────────────────
  if (url.pathname === '/share-target' && request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          const formData = await request.formData();
          const file = formData.get('audio');
          if (file && file instanceof File && file.size > 0) {
            // Store the shared file in a dedicated cache keyed by a fixed URL.
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              '/shared-audio-file',
              new Response(file, {
                headers: {
                  'Content-Type': file.type || 'audio/mp4',
                  'X-Shared-Filename': encodeURIComponent(file.name),
                },
              })
            );
          }
        } catch (err) {
          console.warn('Share target: failed to cache shared file', err);
        }
        // Always redirect to the app root so the SPA boots normally.
        return Response.redirect('/', 303);
      })()
    );
    return;
  }

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
