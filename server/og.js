// OG image generator. GET /api/og?name=...&subtitle=...
// Returns a 1200x630 PNG so WhatsApp/Twitter/etc. show a rich preview.
// Uses @vercel/og, which renders via pure-wasm (yoga + resvg) in plain Node.

import React from 'react'
import { ImageResponse } from '@vercel/og'

const CREAM = '#FFF8EC'
const INK = '#0F0F12'
const PINK = '#FF4FA3'

const h = React.createElement

export function renderOgImage({ name, subtitle, origin }) {
  const title = (name || 'Pointification').slice(0, 60)
  const sub = (subtitle || 'Live scoreboard').slice(0, 80)
  const iconUrl = `${origin}/pointification.png`

  return new ImageResponse(
    h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: CREAM,
          padding: '72px 80px',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        },
      },
      // Top accent stripe
      h('div', {
        style: { position: 'absolute', top: 0, left: 0, right: 0, height: 18, background: PINK },
      }),
      // Brand row
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 24 } },
        h('img', {
          src: iconUrl,
          width: 112,
          height: 112,
          style: { width: 112, height: 112, objectFit: 'contain' },
        }),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column' } },
          h('div', { style: { fontSize: 40, fontWeight: 800, color: INK, lineHeight: 1 } }, 'Pointification'),
          h('div', { style: { fontSize: 24, color: INK, opacity: 0.6, marginTop: 8 } }, 'Live scoreboards')
        )
      ),
      // Headline
      h(
        'div',
        {
          style: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            marginTop: 40,
          },
        },
        h(
          'div',
          { style: { fontSize: 96, fontWeight: 800, color: INK, lineHeight: 1.05, letterSpacing: '-0.02em' } },
          title
        ),
        h('div', { style: { fontSize: 40, color: INK, opacity: 0.7, marginTop: 24 } }, sub)
      ),
      // Footer chip
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        h('div', {
          style: { width: 18, height: 18, borderRadius: 999, background: PINK, border: `3px solid ${INK}` },
        }),
        h('div', { style: { fontSize: 26, fontWeight: 700, color: INK, opacity: 0.7 } }, 'pointification.de')
      )
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'cache-control': 'public, s-maxage=600, stale-while-revalidate=86400' },
    }
  )
}
