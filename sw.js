// =============================================================
// sw.js — the "service worker": saves a copy of every app file on
// the phone so the app opens with no internet (e.g. at the gym).
//
// ⚠️ WHEN YOU UPDATE THE APP: change VERSION below (e.g. 1.0.1).
// That tells phones to download the new files. Your workout data
// is stored separately (IndexedDB) and is NOT touched by updates.
// =============================================================

const VERSION = '1.0.0';
const CACHE = 'gymtracker-' + VERSION;

// Every file the app needs to work offline
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './vendor/chart.umd.min.js',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/seed.js',
  './js/logic.js',
  './js/ui.js',
  './js/timer.js',
  './js/views/home.js',
  './js/views/session.js',
  './js/views/history.js',
  './js/views/manage.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// 1. Install: download all files into a new cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
  );
});

// 2. The page asks to switch to the new version (the "tap to update" bar)
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// 3. Activate: delete caches from older versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gymtracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 4. Fetch: answer from the cache first (works offline), else the network
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // e.g. YouTube links
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
