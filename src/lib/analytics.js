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
  document.head.appendChild(s)
}

// Always optional-chained: an ad blocker, or a hostname outside `data-domains`,
// leaves `window.umami` undefined.
export function track(name, data) {
  window.umami?.track(name, data)
}

// A game only counts as "played" once per page session, however many taps it
// gets — the taps themselves are volume, not a signal.
const scored = new Set()
export function trackFirstScore(gameId) {
  if (!gameId || scored.has(gameId)) return
  scored.add(gameId)
  track('game-scored')
}
