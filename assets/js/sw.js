// sw.js
const CACHE_NAME = 'palopota-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/admin.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/js/data.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// ---- PUSH NOTIFICATION ----
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'PALOPOTA AI', body: 'Ada informasi baru!' };
  const options = {
    body: data.body,
    icon: '/iconpalopota192.png',
    badge: '/iconpalopota192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'PALOPOTA AI', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});