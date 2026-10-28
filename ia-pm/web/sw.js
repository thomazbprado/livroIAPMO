// Service worker: guarda o "casco" do aplicativo para abrir offline. Chamadas da API nunca são guardadas.
const CACHE = 'iapm-shell-v1';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/assets/icon.svg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/v1/') || url.pathname.startsWith('/docs') || url.pathname === '/saude') return;
  // rede primeiro, cache como reserva: o aplicativo sempre abre a versão mais recente quando há conexão
  e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); return r; }).catch(() => caches.match(req).then((m) => m || caches.match('/'))));
});
