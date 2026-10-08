/* Offline shell for the race weekend. Tiles are stored only after a crew
   member has already viewed that part of the Jakarta–Bandung corridor. */
const SHELL_CACHE = "playon-shell-v21";
const LIST_CACHE = "playon-list";
const TILE_CACHE = "playon-tiles";
const TILE_LIMIT = 700;

const SHELL = [
  "./",
  "index.html",
  "css/styles.css?v=13",
  "js/app.js?v=17",
  "js/data.js?v=17",
  "js/i18n.js?v=3",
  "js/stations.js",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/images/marker-icon.png",
  "vendor/leaflet/images/marker-icon-2x.png",
  "vendor/leaflet/images/marker-shadow.png",
  "favicon.ico",
  "favicon.png",
  "manifest.webmanifest",
];

/* Start is Kemdiktisaintek. Finish is Kampus ITB. The box covers Puncak. */
const CORRIDOR = { north: -6.12, south: -6.98, west: 106.68, east: 107.72 };

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE && key !== LIST_CACHE && key !== TILE_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

function tileNorth(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function tileCoords(url) {
  if (url.hostname === "tile.openstreetmap.org") {
    const match = url.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (!match) return null;
    return { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) };
  }
  if (url.hostname === "server.arcgisonline.com" && url.pathname.includes("/MapServer/tile/")) {
    const bits = url.pathname.split("/");
    const z = Number(bits[bits.length - 3]);
    const y = Number(bits[bits.length - 2]);
    const x = Number(bits[bits.length - 1]);
    if (![z, y, x].every(Number.isInteger)) return null;
    return { z, x, y };
  }
  return null;
}

function corridorTile(url) {
  const tile = tileCoords(url);
  if (!tile) return false;
  const { z, x, y } = tile;
  if (z < 0 || z > 19) return false;
  const span = 2 ** z;
  const west = (x / span) * 360 - 180;
  const east = ((x + 1) / span) * 360 - 180;
  const north = tileNorth(y, z);
  const south = tileNorth(y + 1, z);
  return south <= CORRIDOR.north && north >= CORRIDOR.south && west <= CORRIDOR.east && east >= CORRIDOR.west;
}

async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map((key) => cache.delete(key)));
}

function shellMatch(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.endsWith("/") || path.endsWith("/index.html")) return caches.match("index.html");
  return caches.match(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (corridorTile(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response && (response.ok || response.type === "opaque")) {
        await cache.put(request, response.clone());
        trimTiles(cache);
      }
      return response;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put("index.html", copy));
          }
          return response;
        })
        .catch(() => shellMatch(request))
    );
    return;
  }

  const isList = url.pathname.endsWith("/js/data.js");
  event.respondWith((async () => {
    const cacheName = isList ? LIST_CACHE : SHELL_CACHE;
    const cache = await caches.open(cacheName);
    const hit = isList ? await cache.match("hospital-list") : await cache.match(request);
    const shellHit = hit || await caches.match(request);
    const update = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(isList ? "hospital-list" : request, response.clone());
          if (isList) caches.open(SHELL_CACHE).then((shell) => shell.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => null);
    if (shellHit) {
      update.catch(() => {});
      return shellHit;
    }
    const fresh = await update;
    if (fresh) return fresh;
    return shellHit || Response.error();
  })());
});
