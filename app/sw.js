/**
 * Service Worker — WM 2026 Smart Spielplan
 *
 * Strategy:
 *  - Static app shell (HTML/CSS/JS) → Cache First
 *  - Data files (JSON)              → Network First, fallback to cache
 *  - External CDN (Leaflet)         → Cache First
 *  - Flag images                    → Cache First (lazy)
 */

const CACHE_VERSION = 'wm2026-v1';

const STATIC_ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/simulation.html',
  '/app/app.js',
  '/app/simulation.js',
  '/app/styles.css',
  '/app/simulation.css',
  '/app/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

const DATA_ASSETS = [
  '/data/wm_2026_simulation_data.json',
  '/data/wm_2026_matches_fifa.json',
  '/data/fifa_mens_ranking_latest.json',
  '/data/wm_2026_odds_snapshot.json',
];

// ─── Install: pre-cache static assets ───────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── Activate: clean up old caches ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: routing strategy ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Data files → Network First (fresh odds/results), fallback to cache
  if (DATA_ASSETS.some((d) => url.pathname.startsWith('/data/'))) {
    event.respondWith(networkFirstThenCache(event.request));
    return;
  }

  // Flags → Cache First (lazy populate)
  if (url.pathname.startsWith('/assets/flags/')) {
    event.respondWith(cacheFirstThenNetwork(event.request));
    return;
  }

  // Everything else → Cache First
  event.respondWith(cacheFirstThenNetwork(event.request));
});

async function networkFirstThenCache(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('{"error":"offline"}', {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirstThenNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
