// =====================================================================
// Service worker — mostra os avisos de marcações novas
// =====================================================================

self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.titulo || 'Nova marcação', {
    body: d.corpo || '',
    icon: 'assets/icone-192.png',
    tag: d.id || undefined,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL('painel.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find((c) => c.url.startsWith(destino));
    return aberta ? aberta.focus() : self.clients.openWindow(destino);
  })());
});
