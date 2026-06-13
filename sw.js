// Service worker for the Copa 2026 PWA.
// Goal: make the app installable and fast on repeat loads. Firebase calls always
// hit the network (auth/Firestore are dynamic), so we only manage same-origin GETs.

const VERSION = 'v8';
const CACHE = `copados-${VERSION}`;

// App shell — resolved relative to the SW location (repo root), so it works under
// a GitHub Pages subpath too.
const SHELL = [
  '.',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/firebase-backend.js',
  'js/config.js',
  'js/data.js',
  'js/engine.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle our own origin; let Firebase/CDN requests pass straight through.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so deploys are picked up, fall back to cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html').then(r => r || caches.match('.')))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
