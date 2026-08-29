// Bump this on every deploy that changes cached files, so old clients pick up fresh assets.
const CACHE_NAME = 'merlitomoney-shell-v2';
const SHELL_FILES = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls — balances/transactions must always be live, never stale.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  // Network-first for the app shell: always prefer the latest deployed code,
  // only fall back to cache when truly offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
