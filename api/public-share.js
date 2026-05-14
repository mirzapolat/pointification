// Vercel serverless function. Rewritten target for /p/:token.
// Fetches the shared game via the Supabase anon client (RLS allows public reads
// only when is_public=true), then returns the built SPA shell with OG/Twitter
// meta injected into <head>. React Router still takes over after hydration.

import { createClient } from '@supabase/supabase-js'

const SUPA_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  const token = String(req.query.token ?? '').trim()

  const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0]
  const host  = (req.headers['x-forwarded-host'] || req.headers.host || '').toString()
  const base  = `${proto}://${host}`
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
        const bits = [
          `${teams.length} ${teams.length === 1 ? 'team' : 'teams'}`,
          top ? `${top.name} leads with ${top.score}` : null,
          'Live updates as scores change.'
        ].filter(Boolean)
        description = bits.join(' · ')
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
    const r = await fetch(`${base}/index.html`)
    shell = await r.text()
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

  // Replace the static <title> + the static og:image/og:url/twitter:image so the
  // public-share meta wins.
  shell = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta property="og:(title|description|image|image:width|image:height|image:alt|url|type|site_name)"[^>]*>/gi, '')
    .replace(/<meta name="twitter:(card|title|description|image)"[^>]*>/gi, '')
    .replace(/<meta name="description"[^>]*>/i, '')
    .replace(/<link rel="canonical"[^>]*>/i, '')
    .replace('</head>', meta + '\n</head>')

  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'public, s-maxage=120, stale-while-revalidate=600')
  res.status(200).send(shell)
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}
