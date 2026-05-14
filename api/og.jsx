// Edge OG image generator. /api/og?name=...&subtitle=...
// Returns a 1200x630 PNG so WhatsApp/Twitter/etc. show a rich preview.

import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

const CREAM = '#FFF8EC'
const INK   = '#0F0F12'
const PINK   = '#FF4FA3'

export default function handler(req) {
  const url = new URL(req.url)
  const name     = (url.searchParams.get('name')     || 'Pointification').slice(0, 60)
  const subtitle = (url.searchParams.get('subtitle') || 'Live scoreboard').slice(0, 80)
  const iconUrl  = `${url.origin}/pointification.png`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: CREAM,
          padding: '72px 80px',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Top accent stripe */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 18,
            background: PINK,
          }}
        />

        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <img
            src={iconUrl}
            width={112}
            height={112}
            style={{
              width: 112,
              height: 112,
              objectFit: 'contain',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: INK, lineHeight: 1 }}>
              Pointification
            </div>
            <div style={{ fontSize: 24, color: INK, opacity: 0.6, marginTop: 8 }}>
              Live scoreboards
            </div>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            marginTop: 40,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              color: INK,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 40,
              color: INK,
              opacity: 0.7,
              marginTop: 24,
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Footer chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: PINK,
              border: `3px solid ${INK}`,
            }}
          />
          <div style={{ fontSize: 26, fontWeight: 700, color: INK, opacity: 0.7 }}>
            pointification.de
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'cache-control': 'public, s-maxage=600, stale-while-revalidate=86400' },
    }
  )
}
