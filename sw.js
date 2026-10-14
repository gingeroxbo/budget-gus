/* Hors connexion : réseau d'abord pour la page et les données, cache d'abord pour le reste. */
const VERSION = 'budget-v2';
const SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'data/budget.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/maskable-512.png',
  'fonts/unbounded-latin-400-normal.woff2', 'fonts/unbounded-latin-600-normal.woff2', 'fonts/unbounded-latin-700-normal.woff2',
  'fonts/ibm-plex-sans-latin-400-normal.woff2', 'fonts/ibm-plex-sans-latin-500-normal.woff2', 'fonts/ibm-plex-sans-latin-600-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2', 'fonts/ibm-plex-mono-latin-500-normal.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, key) {
  const cache = await caches.open(VERSION);
  const net = fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(key, res.clone()); return res; });
  // Réseau lent : au bout de 4 s, on sert la copie gardée sur le téléphone.
  const timer = new Promise(r => setTimeout(r, 4000, 'lent'));
  try {
    const r = await Promise.race([net, timer]);
    if (r !== 'lent') return r;
  } catch (e) {
    return (await cache.match(key)) || Response.error();
  }
  return (await cache.match(key)) || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, 'index.html')); return; }
  if (url.pathname.endsWith('/data/budget.json')) { e.respondWith(networkFirst(req, 'data/budget.json')); return; }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
