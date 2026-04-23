/* Реестр ЭИС — service worker
 * Cache-first для своих файлов, stale-while-revalidate для Google Fonts.
 * Бампайте CACHE_VERSION при релизе, чтобы SW сбросил старый кэш.
 */
const CACHE_VERSION = 'eis-registry-v1';
const CORE_ASSETS = [
  './',
  './app.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isFont = url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');
  const isCdn  = url.hostname.endsWith('jsdelivr.net');

  // Same-origin: cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached))
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
