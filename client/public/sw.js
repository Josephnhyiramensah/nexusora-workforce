/* Nexusora Workforce — service worker.
   Goals: make the app installable + fast on repeat loads + usable offline as a
   shell, WITHOUT ever serving stale authenticated data.
   Strategy:
     • /api/*            → never handled here (always hits the network).
     • navigations       → network-first, fall back to the cached app shell
                           when offline (so the installed app still opens).
     • hashed assets     → stale-while-revalidate (immutable, safe to cache).
     • everything else   → passthrough. */
const VERSION = 'nxwf-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()).catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;                    // only cache reads
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;         // third-party → passthrough
  if (url.pathname.startsWith('/api/')) return;            // never cache API/auth

  // Navigations: network-first, cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/', copy)).catch(() => {}); return res; })
        .catch(() => caches.match('/', { ignoreSearch: true }).then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Hashed static assets: stale-while-revalidate.
  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSETS).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request).then((res) => { if (res && res.status === 200) cache.put(request, res.clone()); return res; }).catch(() => cached);
          return cached || network;
        }),
      ),
    );
  }
});

// Let the page trigger an immediate update when it detects a new SW.
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
