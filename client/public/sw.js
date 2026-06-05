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

const CACHE_VERSION = 'schofy-v15';
const ASSET_CACHE = 'schofy-assets-v15';

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
  '/chat-icon.png',
  '/sound/success.mp3',
  '/sound/error.wav',
  '/sounds/success.mp3',
  '/sounds/error.wav',
];

function sameOriginUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, self.location.origin);
    return url.origin === self.location.origin ? url : null;
  } catch {
    return null;
  }
}

function extractAssetUrlsFromHtml(html) {
  const urls = [];
  const pattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(html))) {
    const url = sameOriginUrl(match[1]);
    if (url) urls.push(url.toString());
  }
  return Array.from(new Set(urls));
}

async function cacheAppShell() {
  const shellCache = await caches.open(CACHE_VERSION);
  const assetCache = await caches.open(ASSET_CACHE);
  await Promise.allSettled(PRECACHE_URLS.map(url => shellCache.add(url)));

  try {
    const response = await fetch('/index.html', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return;
    const clone = response.clone();
    await shellCache.put('/index.html', clone);
    await shellCache.put('/', response.clone());
    const html = await response.text();
    const assetUrls = extractAssetUrlsFromHtml(html);
    await Promise.allSettled(assetUrls.map(async url => {
      const assetResponse = await fetch(url, { credentials: 'same-origin', cache: 'reload' });
      if (assetResponse.ok && assetResponse.status === 200) await assetCache.put(url, assetResponse);
    }));
  } catch {
    // The app will cache more resources after the first online launch.
  }
}

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url))))
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

  // Dev-server module paths must stay network-owned.
  if (
    url.origin === self.location.origin &&
    (
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
          caches.match('/index.html').then(r => r || caches.match('/').then(home => home || new Response('App is loading...', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          })))
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
      '/chat-icon.png',
      '/sound/success.mp3',
      '/sound/error.wav',
      '/sounds/success.mp3',
      '/sounds/error.wav',
      ...urls,
    ];

    event.waitUntil(
      Promise.all([
        cacheAppShell(),
        caches.open(ASSET_CACHE).then(cache =>
          Promise.allSettled(shellUrls.map(rawUrl => {
            const url = sameOriginUrl(rawUrl);
            if (!url) return Promise.resolve();
            return fetch(url.toString(), { credentials: 'same-origin' }).then(res => {
              if (res.ok && res.status === 200) return cache.put(url.toString(), res);
            }).catch(() => {});
          }))
        )
      ])
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

// Extra install pass: cache index.html plus the current Vite JS/CSS chunks.
self.addEventListener('install', event => {
  event.waitUntil(cacheAppShell().catch(() => {}));
});
