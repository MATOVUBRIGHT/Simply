/**
 * Schofy Service Worker — Offline-first, cache everything
 *
 * Strategy:
 * - On install: cache index.html + manifest immediately
 * - On fetch (assets): cache-first — serve from cache, update in background
 * - On fetch (navigation): serve cached index.html so SPA works offline
 * - On fetch (Supabase API): network-only — app handles data caching in localStorage
 * - Dynamic caching: every JS/CSS/font/image response is cached automatically
 * - Cache is versioned — old caches are deleted on activate
 */

const CACHE_VERSION = 'schofy-v6';
const ASSET_CACHE = 'schofy-assets-v6';

// Core files to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {/* ignore — will be cached on first visit */})
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION && k !== ASSET_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, update in background ────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests entirely
  if (req.method !== 'GET') return;

  // Skip Supabase API — app handles data caching in localStorage/IndexedDB
  if (url.hostname.includes('supabase.co')) return;

  // Skip chrome-extension and other non-http(s) protocols
  if (!url.protocol.startsWith('http')) return;

  // Skip range requests (audio/video streaming) — can't cache partial responses
  if (req.headers.get('range')) return;

  // ── SPA navigation — always serve index.html ──────────────────────────────
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Cache the fresh index.html
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put('/index.html', clone)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          // Offline: serve cached index.html so the SPA still loads
          caches.match('/index.html').then(r => r || new Response('App is loading...', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          }))
        )
    );
    return;
  }

  // ── Static assets: cache-first, update in background ─────────────────────
  const isAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.wav') ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.json');

  if (isAsset) {
    event.respondWith(
      caches.match(req).then(cached => {
        // Serve from cache immediately if available
        const networkFetch = fetch(req).then(res => {
          // Cache valid complete responses only (not partial/opaque)
          if (res.ok && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => cached); // If network fails, fall back to cache

        // Return cached immediately, update in background
        return cached || networkFetch;
      })
    );
    return;
  }

  // ── Everything else: network with cache fallback ──────────────────────────
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(ASSET_CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || new Response('', { status: 503 })))
  );
});

// ── Message: force cache refresh from app ────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(ASSET_CACHE).then(cache => {
      urls.forEach(url => {
        fetch(url).then(res => {
          if (res.ok && res.status === 200) cache.put(url, res);
        }).catch(() => {});
      });
    });
  }
});
