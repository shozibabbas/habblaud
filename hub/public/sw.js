/* Habblaud Hub service worker: caches only the hub's own shell so the installed app opens instantly.
 * - Never touches cross-origin requests (the office iframes and everything inside them go straight to the network).
 * - Shell files: network first (always fresh from localhost), cache as the fallback.
 * - config.json: network first, last good copy as the fallback.
 */
'use strict';

const CACHE = 'habblaud-hub-v1';
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/manifest.webmanifest'];
const ICONS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];
const CACHED = new Set([...SHELL, ...ICONS, '/config.json']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // Icons are nice to have offline, but a missing one must not block the install.
      await Promise.all(ICONS.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // offices: not ours, never intercepted

  const path = req.mode === 'navigate' && url.pathname === '/' ? '/' : url.pathname;
  if (!CACHED.has(path)) return;
  event.respondWith(networkFirst(req, path));
});

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req); // nginx sends these with Cache-Control: no-cache
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(key)) || (key === '/' && (await cache.match('/index.html')));
    if (hit) return hit;
    throw err;
  }
}
