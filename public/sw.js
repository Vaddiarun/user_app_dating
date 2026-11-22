// Vibe service worker — makes the site installable as an app and lets it open offline.
// Deliberately minimal: it only ever handles this site's own GET requests. The API, Firebase,
// Cashfree, Agora and everything else on another origin go straight to the network untouched,
// so logins, payments and calls behave exactly as in the browser.
const CACHE = 'vibe-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/logo.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Pages: always the live version (so a new deploy shows up at once); the cached app shell only
  // when there's no network at all.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }

  // Built assets have a content hash in their name, so a cached copy is always the right one.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })),
    )
  }
})
