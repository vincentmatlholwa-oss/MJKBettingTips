var CACHE_NAME = 'mjk-tips-v3';
var PRECACHE_URLS = ['/', '/index.html', '/styles.css', '/app.js', '/logo.jpg', '/manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE_NAME).then(function(c) { return c.addAll(PRECACHE_URLS); }).then(function() { return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(names) {
    return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
  }).then(function() { return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e) {
  if (e.request.url.indexOf('/api/') >= 0) {
    e.respondWith(fetch(e.request).catch(function() { return caches.match(e.request); }));
  } else {
    e.respondWith(caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(resp) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        return resp;
      });
    }).catch(function() { return caches.match('/index.html'); }));
  }
});

// Push from browser Push API
self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : { title: 'MJK Tips', body: 'New tips available!' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    vibrate: [200, 100, 200],
    tag: 'mjk-tip',
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data ? e.notification.data.url : '/'));
});
