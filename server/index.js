// Pointification server.
//
// One process does everything: it owns the SQLite database, exposes the JSON
// API the SPA talks to, streams live score changes over SSE, stores uploaded
// game logos on disk, serves the built SPA, and server-renders the share-link
// meta tags so /p/:token gets a rich preview.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import express from 'express'
import cookieParser from 'cookie-parser'

import { DB_PATH } from './db.js'
import { LOGO_DIR } from './lib/logos.js'
import { attachUser, pruneSessions } from './lib/auth.js'
import { errorHandler } from './lib/http.js'
import { mailEnabled } from './lib/mail.js'
import { renderOgImage } from './og.js'

import authRoutes from './routes/auth.js'
import accountRoutes from './routes/account.js'
import gameRoutes from './routes/games.js'
import teamRoutes from './routes/teams.js'
import roundRoutes from './routes/rounds.js'
import publicRoutes, { findPublicGame } from './routes/public.js'
import realtimeRoutes from './routes/realtime.js'
import { all } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const DIST_DIR = process.env.DIST_DIR
  ? path.resolve(process.env.DIST_DIR)
  : path.resolve(__dirname, '../dist')
const INDEX_HTML = path.join(DIST_DIR, 'index.html')

// The SPA shell never changes at runtime, so read it once.
const shellPromise = readFile(INDEX_HTML, 'utf8')

const app = express()
app.disable('x-powered-by')
// Traefik terminates TLS in front of us; trust its forwarding headers so
// secure cookies and absolute URLs come out right.
app.set('trust proxy', true)

app.use(cookieParser())
// Logo uploads arrive as a raw image body; everything else is JSON.
app.use('/api', express.raw({ type: 'image/*', limit: '4mb' }))
app.use('/api', express.json({ limit: '1mb' }))
app.use('/api', attachUser)

function originOf(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0]
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`)
  return `${proto}://${host}`
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

// --- API ------------------------------------------------------------------
app.use('/api/auth', authRoutes)
app.use('/api/account', accountRoutes)
app.use('/api/games', gameRoutes)
app.use('/api/teams', teamRoutes)
app.use('/api/rounds', roundRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/realtime', realtimeRoutes)

// --- OG image -------------------------------------------------------------
app.get('/api/og', async (req, res) => {
  try {
    const image = renderOgImage({
      name: String(req.query.name ?? ''),
      subtitle: String(req.query.subtitle ?? ''),
      origin: originOf(req),
    })
    const buf = Buffer.from(await image.arrayBuffer())
    image.headers.forEach((value, key) => res.setHeader(key, value))
    res.status(200).send(buf)
  } catch (err) {
    console.error('[og] render failed:', err)
    res.status(500).send('Could not render image')
  }
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint.' }))
app.use('/api', errorHandler)

// --- Uploaded logos -------------------------------------------------------
app.use('/logos', express.static(LOGO_DIR, {
  maxAge: '30d',
  index: false,
  dotfiles: 'ignore',
  setHeaders: (res) => {
    // These files are user-supplied. Stop the browser sniffing a type, and
    // sandbox them so an uploaded SVG can't run script if opened directly.
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  },
}))
// A missing logo is a missing file, not a route for the SPA to handle.
app.use('/logos', (_req, res) => res.status(404).end())

// --- Public share SSR (rich link previews) --------------------------------
app.get('/p/:token', async (req, res) => {
  const token = String(req.params.token ?? '').trim()
  const base = originOf(req)
  const pageUrl = token ? `${base}/p/${encodeURIComponent(token)}` : base

  let title = 'Pointification — live scoreboard'
  let description = 'Watch a live scoreboard update in real time. No installs, no account needed.'
  let ogImageQuery = '?name=' + encodeURIComponent('Pointification')

  const game = findPublicGame(token)
  if (game) {
    const teams = all('SELECT name, score FROM teams WHERE game_id = ?', game.id)
    const top = [...teams].sort((a, b) => b.score - a.score)[0]
    title = `${game.name} · live scoreboard`
    description = [
      `${teams.length} ${teams.length === 1 ? 'team' : 'teams'}`,
      top ? `${top.name} leads with ${top.score}` : null,
      'Live updates as scores change.',
    ].filter(Boolean).join(' · ')
    ogImageQuery =
      '?name=' + encodeURIComponent(game.name) +
      '&subtitle=' + encodeURIComponent(top ? `${top.name} leads with ${top.score}` : 'Live scoreboard')
  }

  const ogImage = `${base}/api/og${ogImageQuery}`

  let shell
  try {
    shell = await shellPromise
  } catch {
    res.status(500).send('Could not load app shell')
    return
  }

  const meta = `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(pageUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Pointification" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(pageUrl)}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(title)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(ogImage)}" />
  `.trim()

  // Strip the static meta so the per-share meta wins, then inject before </head>.
  const html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta property="og:(title|description|image|image:width|image:height|image:alt|url|type|site_name)"[^>]*>/gi, '')
    .replace(/<meta name="twitter:(card|title|description|image)"[^>]*>/gi, '')
    .replace(/<meta name="description"[^>]*>/i, '')
    .replace(/<link rel="canonical"[^>]*>/i, '')
    .replace('</head>', meta + '\n</head>')

  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'public, s-maxage=120, stale-while-revalidate=600')
  res.status(200).send(html)
})

// --- Static assets --------------------------------------------------------
app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }))

// --- SPA fallback ---------------------------------------------------------
app.get('*', async (_req, res) => {
  try {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.status(200).send(await shellPromise)
  } catch {
    res.status(500).send('Could not load app shell')
  }
})

app.use(errorHandler)

// Expired sessions and verification codes are swept on boot, then hourly.
pruneSessions()
setInterval(pruneSessions, 3600_000).unref()

createServer(app).listen(PORT, HOST, () => {
  console.log(`[pointification] serving ${DIST_DIR} on http://${HOST}:${PORT}`)
  console.log(`[pointification] database ${DB_PATH}`)
  console.log(`[pointification] logos    ${LOGO_DIR}`)
  if (!mailEnabled) {
    console.log('[pointification] SMTP not configured — new accounts are verified automatically.')
  }
})
