self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {});

self.addEventListener('push', e => {
  let data = { title: '새 신청', body: '관리자 페이지를 확인해주세요' };
  try { if (e.data) data = e.data.json(); } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/sangjakting/icon-192.png',
      badge: '/sangjakting/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: '/sangjakting/admin.html' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/sangjakting/admin') && 'focus' in client) return client.focus();
      }
      return clients.openWindow('/sangjakting/admin.html');
    })
  );
});
