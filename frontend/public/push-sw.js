self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'EHE ERP', {
    body: payload.body || 'Vous avez une nouvelle notification.',
    icon: '/app-ehe/pwa-192x192.png',
    badge: '/app-ehe/pwa-192x192.png',
    tag: payload.tag || 'ehe-notification',
    renotify: true,
    data: { url: payload.url || '/app-ehe/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/app-ehe/', self.location.origin).href;

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if ('navigate' in client) await client.navigate(targetUrl);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
