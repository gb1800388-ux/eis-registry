/* Реестр ЭИС — service worker
 * Network-first для своих файлов (чтобы обновления кода приходили сразу),
 * stale-while-revalidate для Google Fonts и CDN.
 * Бампайте CACHE_VERSION при релизе — старый кэш будет вычищен на activate.
 */
const CACHE_VERSION = 'eis-registry-v3';
const CORE_ASSETS = [
  './',
  './app.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Allow the page to ask the SW to skip waiting, so we get the new version
// immediately instead of on next tab close.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isFont = url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');
  const isCdn  = url.hostname.endsWith('jsdelivr.net');

  // Same-origin: network-first so the user always gets the latest code;
  // fall back to cache only when offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Fonts / CDN: stale-while-revalidate.
  if (isFont || isCdn) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((res) => {
            cache.put(req, res.clone()).catch(() => {});
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
  }
});
