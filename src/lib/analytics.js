// Umami analytics (self-hosted, cookieless). One website record per project;
// the ID is public by design — it ships in the page source either way.
//
// Everything lives in this one module because the tracker's `beforeSend` hook
// has to be a global that exists *before* the script loads, and it shares the
// path-sanitising logic below with nothing else worth duplicating in
// index.html.

const SCRIPT_URL = 'https://umami.mirzapolat.com/script.js'
const WEBSITE_ID = '0114a792-559f-43e2-bd4d-2543413c411b'
// Client-side allowlist: keeps `npm run dev` out of the stats. Add 'localhost'
// here temporarily to test tracking locally — never commit that.
const DOMAINS = 'pointification.de'

const BEFORE_SEND = '__pointificationBeforeSend'

// Public share links and game ids sit in the path. Umami stores the URL it is
// given, so send a shape instead of the real value: a share token is the only
// thing protecting a public scoreboard, and raw game ids would turn the pages
// report into hundreds of one-hit rows.
export function sanitizePath(path) {
  return path
    .replace(/^\/p\/[^/]+/, '/p/:token')
    .replace(/^\/game\/[^/]+/, '/game/:id')
}

function sanitizeUrl(value) {
  if (typeof value !== 'string' || !value) return value
  try {
    // Absolute (referrer) — only ours can carry a token; leave others alone.
    const u = new URL(value, window.location.origin)
    if (u.origin !== window.location.origin) return value
    return sanitizePath(u.pathname)
  } catch {
    return sanitizePath(value.split(/[?#]/)[0])
  }
}

export function initAnalytics() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`script[data-website-id="${WEBSITE_ID}"]`)) return

  window[BEFORE_SEND] = (_type, payload) => ({
    ...payload,
    url: sanitizeUrl(payload.url),
    referrer: sanitizeUrl(payload.referrer),
  })

  const s = document.createElement('script')
  s.defer = true
  s.src = SCRIPT_URL
  s.dataset.websiteId = WEBSITE_ID
  s.dataset.domains = DOMAINS
  s.dataset.excludeSearch = 'true'
  // The privacy page promises a DNT opt-out — keep that promise here.
  s.dataset.doNotTrack = 'true'
  s.dataset.beforeSend = BEFORE_SEND
  // The script is a separate round trip, so `window.umami` does not exist for
  // the first few hundred ms. `track` parks calls made in that window; replay
  // them once the tracker is there, and bin them if it never arrives (an ad
  // blocker aborts the request, which lands here as `error`).
  s.addEventListener('load', flushPending)
  s.addEventListener('error', dropPending)
  document.head.appendChild(s)
}

// Events fired from a mount effect — `public-view` is the usual one — race the
// tracker script and used to vanish into the optional chain below, which is why
// pageviews showed up in Umami and custom events did not. Hold them instead.
//
// Replay uses the tracker's *current* URL, not the one from when the call was
// queued. The gap is the script's load time, so a route change inside it is
// unlikely; the alternative is reimplementing Umami's payload builder here.
let pending = []
// A page that never loads the tracker must not grow this forever.
const PENDING_LIMIT = 20

function flushPending() {
  const queued = pending
  pending = []
  for (const [name, data] of queued) window.umami?.track(name, data)
}

function dropPending() {
  pending = []
}

// Still optional-chained after a flush: a hostname outside `data-domains`, or
// `localStorage['umami.disabled']`, leaves the tracker loaded but inert.
export function track(name, data) {
  if (typeof window === 'undefined') return
  if (!window.umami) {
    if (pending.length < PENDING_LIMIT) pending.push([name, data])
    return
  }
  window.umami.track(name, data)
}

// A game only counts as "played" once per page session, however many taps it
// gets — the taps themselves are volume, not a signal.
const scored = new Set()
export function trackFirstScore(gameId) {
  if (!gameId || scored.has(gameId)) return
  scored.add(gameId)
  track('game-scored')
}
