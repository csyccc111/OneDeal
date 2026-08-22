/* OneDeal PWA 离线缓存壳（手写轻量 SW，无 workbox 依赖）
 * 策略：页面/API network-first（离线回退缓存）；静态资源 cache-first
 */
const CACHE_NAME = "onedeal-shell-v1";
const PRECACHE = ["/login", "/dashboard", "/orders", "/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 静态资源（_next/static、图标）：cache-first
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return resp;
          }),
      ),
    );
    return;
  }

  // 页面/其他：network-first，离线回退缓存
  event.respondWith(
    fetch(request)
      .then((resp) => {
        if (resp.ok && (resp.type === "basic" || resp.type === "default")) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/login"))),
  );
});
