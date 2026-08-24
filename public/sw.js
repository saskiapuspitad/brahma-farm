// Service worker BrahmaFarm — cache app shell untuk akses offline.
// Strategi: network-first untuk navigasi & API GET (fallback cache),
// cache-first untuk aset statis. Data tulis (POST/PATCH) tidak di-cache;
// penyimpanan draft offline ditangani di sisi aplikasi (outbox localStorage).

const CACHE = "brahmafarm-v1";
const SHELL = ["/dashboard", "/recording/new", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // tulis data: biarkan aplikasi menangani offline

  const url = new URL(req.url);
  // Navigasi halaman: network-first, fallback ke cache lalu /dashboard.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((m) => m || caches.match("/dashboard")))
    );
    return;
  }

  // Aset statis Next: cache-first.
  if (url.pathname.startsWith("/_next/") || url.pathname === "/icon.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }))
    );
    return;
  }
});
