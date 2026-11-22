const VERSION = "v2";
const STATIC_CACHE = `maquis-static-${VERSION}`;
const DATA_CACHE = `maquis-data-${VERSION}`;
const SHELL_ASSETS = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

// Fichiers versionnés par Next.js : jamais modifiés, on les garde pour de bon.
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

// Pages et données : le réseau d'abord (données toujours à jour), la copie gardée
// sur le téléphone seulement si le réseau est absent ou trop lent.
async function networkFirst(request, event) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  try {
    const res = cached ? await withTimeout(fetch(request), NETWORK_TIMEOUT_MS) : await fetch(request);
    if (res.ok && !res.redirected && res.type === "basic") {
      const copy = res.clone();
      event.waitUntil(cache.put(request, copy));
    }
    return res;
  } catch (err) {
    if (cached) return cached;
    if (request.mode === "navigate") {
      const url = new URL(request.url);
      const fallback =
        (await cache.match(url.pathname)) ||
        (await cache.match("/pos")) ||
        (await cache.match("/dashboard"));
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Déconnexion : on efface tout ce qui a été gardé pour cette personne.
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    event.waitUntil(caches.delete(DATA_CACHE));
    return;
  }

  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/_next/static/") || SHELL_ASSETS.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Jamais gardés : connexion, administration, paiement.
  if (
    url.pathname.startsWith("/api/auth/login") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/api/admin") ||
    url.pathname.startsWith("/paiement") ||
    url.pathname.startsWith("/api/paiement")
  ) {
    return;
  }

  event.respondWith(networkFirst(request, event));
});
