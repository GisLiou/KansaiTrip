/* 關西秋旅 Service Worker
   - 行程頁：先抓網路（有更新就換新），沒網路時用快取 → 離線可看
   - 照片、字型：第一次看到就存起來，之後離線也能顯示
   - 不碰 localStorage / IndexedDB，你的勾選紀錄不受更新影響 */
var VERSION = 'kt-v3';
var CORE = 'core-' + VERSION;
var RUNTIME = 'runtime-' + VERSION;
var CORE_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'maskable-512.png',
  'apple-touch-icon.png'
];
var RUNTIME_HOSTS = /(^|\.)(wikimedia\.org|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CORE).then(function (c) { return c.addAll(CORE_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CORE && k !== RUNTIME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      caches.match(req, { ignoreSearch: true }).then(function (r) { if (r && !done) { done = true; resolve(r); } });
    }, 3500);
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CORE).then(function (c) { c.put('index.html', copy); });
      }
      clearTimeout(timer);
      if (!done) { done = true; resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      caches.match('index.html').then(function (r) { if (!done) { done = true; resolve(r || Response.error()); } });
    });
  });
}

function cacheFirst(req, cacheName) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(cacheName).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(req, CORE));
    return;
  }
  if (RUNTIME_HOSTS.test(url.hostname) && (req.destination === 'image' || req.destination === 'style' || req.destination === 'font')) {
    e.respondWith(cacheFirst(req, RUNTIME).catch(function () { return Response.error(); }));
  }
});
