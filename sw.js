self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: '새 신청', body: '관리자 페이지를 확인해주세요' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/sangjakting/icon-192.png',
      badge: '/sangjakting/icon-192.png',
      vibrate: [200, 100, 200]
    })
  );
});
