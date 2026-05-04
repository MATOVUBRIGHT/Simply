const CACHE_NAME = 'schofy-v5';
const ASSET_CACHE = 'schofy-assets-v5';

const PRECACHE = ['/index.html', '/manifest.json', '/favicon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== ASSET_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip: non-GET, Supabase API, chrome-extension, range requests
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.protocol === 'chrome-extension:' ||
    event.request.headers.get('range')
  ) return;

  // SPA navigation — serve cached index.html when offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then(r => r || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Static assets (JS/CSS/images) — cache-first
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          // Only cache complete, successful responses
          if (res.ok && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then(c => c.put(event.request, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else — network only (app handles data caching in localStorage)
});
