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

const CACHE_VERSION = 'schofy-v9';
const ASSET_CACHE = 'schofy-assets-v9';

// Core files to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/cover.jpg',
  '/schofy.logo.png',
  '/sound/success.mp3',
  '/sound/error.wav',
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

  // Cache Supabase storage public images (avatars, logos, etc.)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(
      caches.match(req).then(cached => {
        const networkFetch = fetch(req).then(res => {
          if (res.ok && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Skip Supabase API (database, auth, realtime) — app handles data caching in IndexedDB
  if (url.hostname.includes('supabase.co')) return;

  // Skip chrome-extension and other non-http(s) protocols
  if (!url.protocol.startsWith('http')) return;

  // Admin and dev-server module paths must stay network-owned.
  if (
    url.origin === self.location.origin &&
    (
      url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/src/') ||
      url.pathname.startsWith('/@vite') ||
      url.pathname.includes('/node_modules/.vite/')
    )
  ) {
    return;
  }

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
        // Vite hashes filenames — if we have it cached it's the right version.
        // But for JS/CSS chunks, always try network first so new deployments
        // are picked up immediately; fall back to cache if offline.
        const isHashedChunk = url.pathname.startsWith('/assets/') &&
          (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));

        if (isHashedChunk) {
          // Network-first for JS/CSS chunks — ensures new deployments load correctly
          return fetch(req).then(res => {
            if (res.ok && res.status === 200 && res.type !== 'opaque') {
              const clone = res.clone();
              caches.open(ASSET_CACHE).then(c => c.put(req, clone)).catch(() => {});
            }
            return res;
          }).catch(() => cached || new Response('', { status: 503 }));
        }

        // Cache-first for images, fonts, sounds — these don't change between deploys
        const networkFetch = fetch(req).then(res => {
          if (res.ok && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => cached);

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
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    caches.open(ASSET_CACHE).then(cache => {
      urls.forEach(rawUrl => {
        try {
          const url = new URL(rawUrl, self.location.origin);
          if (url.origin !== self.location.origin) return;
          fetch(url.toString(), { credentials: 'same-origin' }).then(res => {
            if (res.ok && res.status === 200) cache.put(url.toString(), res);
          }).catch(() => {});
        } catch {
          // Ignore malformed cache requests.
        }
      });
    });
  }
  if (event.data?.type === 'CACHE_APP_SHELL') {
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    const shellUrls = [
      '/',
      '/index.html',
      '/manifest.json',
      '/favicon.png',
      '/icon-192.png',
      '/icon-512.png',
      '/cover.jpg',
      '/schofy.logo.png',
      '/sound/success.mp3',
      '/sound/error.wav',
      ...urls,
    ];

    event.waitUntil(
      caches.open(ASSET_CACHE).then(cache =>
        Promise.allSettled(shellUrls.map(rawUrl => {
          try {
            const url = new URL(rawUrl, self.location.origin);
            if (url.origin !== self.location.origin) return Promise.resolve();
            return fetch(url.toString(), { credentials: 'same-origin' }).then(res => {
              if (res.ok && res.status === 200) return cache.put(url.toString(), res);
            }).catch(() => {});
          } catch {
            return Promise.resolve();
          }
        }))
      )
    );
  }
});

self.addEventListener('periodicsync', event => {
  if (event.tag !== 'schofy-refresh-shell') return;
  event.waitUntil(
    caches.open(ASSET_CACHE).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(url =>
        fetch(url, { credentials: 'same-origin' }).then(res => {
          if (res.ok && res.status === 200) return cache.put(url, res);
        }).catch(() => {})
      ))
    )
  );
});
