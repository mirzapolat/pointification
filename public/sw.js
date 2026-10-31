// Pointification service worker.
//
// Goals: installable app, instant repeat loads, and a friendly screen instead
// of the browser's dinosaur when the network is gone. Scores are live data, so
// the API and the realtime stream are never cached — they always hit the
// network (or fail honestly).
//
// Strategy
//   navigations             network-first → cached copy of that page → /offline.html
//   /assets/*               cache-first (Vite file names are content-hashed)
//   icons, fonts, /logos/*  stale-while-revalidate
//   /api/*, non-GET         untouched

const VERSION = 'v1'
const SHELL_CACHE = `pf-shell-${VERSION}`
const PAGE_CACHE = `pf-pages-${VERSION}`
const ASSET_CACHE = `pf-assets-${VERSION}`
const MEDIA_CACHE = `pf-media-${VERSION}`
const KNOWN = [SHELL_CACHE, PAGE_CACHE, ASSET_CACHE, MEDIA_CACHE]

const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/pointification.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n.startsWith('pf-') && !KNOWN.includes(n)).map((n) => caches.delete(n)))
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
    await self.clients.claim()
  })())
})

// The page asks the waiting worker to take over when the user taps "Reload".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(navigation(event))
    return
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(request, ASSET_CACHE, 120))
      return
    }
    if (url.pathname.startsWith('/logos/') || url.pathname.startsWith('/icons/') || url.pathname === '/pointification.png') {
      event.respondWith(staleWhileRevalidate(event, MEDIA_CACHE, 80))
    }
    return
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event, MEDIA_CACHE, 80))
  }
})

async function navigation(event) {
  const { request } = event
  const url = new URL(request.url)
  // Key on the path alone so ?source=pwa and friends share one entry.
  const key = url.origin + url.pathname
  const cache = await caches.open(PAGE_CACHE)
  try {
    const response = (await event.preloadResponse) || (await fetch(request))
    if (response.ok && response.type === 'basic') {
      event.waitUntil(cache.put(key, response.clone()))
    }
    return response
  } catch {
    return (
      (await cache.match(key)) ||
      (await caches.match('/offline.html')) ||
      Response.error()
    )
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    trim(cache, maxEntries)
  }
  return response
}

async function staleWhileRevalidate(event, cacheName, maxEntries) {
  const { request } = event
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  const refresh = fetch(request).then(async (response) => {
    // Opaque (cross-origin font) responses are fine to cache too.
    if (response.ok || response.type === 'opaque') {
      await cache.put(request, response.clone())
      trim(cache, maxEntries)
    }
    return response
  })
  if (hit) {
    event.waitUntil(refresh.catch(() => {}))
    return hit
  }
  return refresh
}

async function trim(cache, maxEntries) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i])
}
