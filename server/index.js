// Pointification server.
// Serves the built SPA (dist/) and provides the two dynamic routes that used to
// run as Vercel functions:
//   GET /api/og        -> social-share PNG (1200x630)
//   GET /p/:token      -> SPA shell with OG/Twitter meta injected per shared game
// Everything else falls back to index.html so React Router can take over.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import express from 'express'
import { createClient } from '@supabase/supabase-js'

import { renderOgImage } from './og.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const DIST_DIR = process.env.DIST_DIR
  ? path.resolve(process.env.DIST_DIR)
  : path.resolve(__dirname, '../dist')
const INDEX_HTML = path.join(DIST_DIR, 'index.html')

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

// The SPA shell never changes at runtime, so read it once.
const shellPromise = readFile(INDEX_HTML, 'utf8')

const app = express()
app.disable('x-powered-by')

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

// --- Public share SSR (rich link previews) --------------------------------
app.get('/p/:token', async (req, res) => {
  const token = String(req.params.token ?? '').trim()
  const base = originOf(req)
  const pageUrl = token ? `${base}/p/${encodeURIComponent(token)}` : base

  let title = 'Pointification — live scoreboard'
  let description = 'Watch a live scoreboard update in real time. No installs, no account needed.'
  let ogImageQuery = '?name=' + encodeURIComponent('Pointification')

  if (token && SUPA_URL && SUPA_ANON) {
    try {
      const supabase = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } })
      const { data } = await supabase
        .from('games')
        .select('name, teams(name, score)')
        .eq('public_token', token)
        .eq('is_public', true)
        .maybeSingle()
      if (data?.name) {
        const teams = data.teams ?? []
        const top = [...teams].sort((a, b) => b.score - a.score)[0]
        title = `${data.name} · live scoreboard`
        description = [
          `${teams.length} ${teams.length === 1 ? 'team' : 'teams'}`,
          top ? `${top.name} leads with ${top.score}` : null,
          'Live updates as scores change.',
        ].filter(Boolean).join(' · ')
        ogImageQuery =
          '?name=' + encodeURIComponent(data.name) +
          '&subtitle=' + encodeURIComponent(top ? `${top.name} leads with ${top.score}` : 'Live scoreboard')
      }
    } catch {
      // fall through to defaults
    }
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

createServer(app).listen(PORT, HOST, () => {
  console.log(`[pointification] serving ${DIST_DIR} on http://${HOST}:${PORT}`)
  if (!SUPA_URL || !SUPA_ANON) {
    console.warn('[pointification] SUPABASE_URL / SUPABASE_ANON_KEY not set — /p/:token previews will use defaults.')
  }
})
