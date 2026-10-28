// Service worker: rede primeiro, cache como reserva (RF-18). Só é registrado em contexto seguro
// (HTTPS ou localhost); pela Wi-Fi em HTTP o app funciona normalmente, só não fica offline.
const VERSION = '1.0.2';
const CACHE = `teleprompter-${VERSION}`;
const SCOPE = self.registration.scope;
const API_PATH = new URL('api/', SCOPE).pathname;
const INDEX_URL = new URL('index.html', SCOPE).href;

// Casca do app. Os módulos do teleprompter que não estão aqui entram no cache no primeiro uso.
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/editor.css',
  'css/panel.css',
  'css/prompter.css',
  'js/main.js',
  'js/store.js',
  'js/metrics.js',
  'js/platform.js',
  'js/icons.js',
  'js/editor.js',
  'js/panel.js',
  'js/markdown.js',
  'js/roteiros.js',
  'js/prompter/prompter.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Um arquivo que falhe não impede a instalação dos demais.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('teleprompter-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.status === 200 && response.type === 'basic') cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ??
      (request.mode === 'navigate' ? await cache.match(INDEX_URL) : undefined);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(API_PATH)) return; // Roteiros do PC: sempre da rede
  if (request.headers.has('range')) return; // pedidos parciais (vídeo) ficam com a rede
  event.respondWith(networkFirst(request));
});
