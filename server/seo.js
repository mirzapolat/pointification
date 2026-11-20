// Shared by the build, HTTP server, and client-side navigation.
export const SITE_URL = 'https://pointification.de'
export const PUBLIC_PAGES = {
  '/': {
    title: 'Pointification — Free Online Scoreboard & Live Scorekeeper',
    description: 'Keep score for quiz nights, classrooms and game nights with Pointification. Create teams, invite scorekeepers and share a live scoreboard. Free, no installs.',
  },
  '/imprint': {
    title: 'Imprint & Contact | Pointification',
    description: 'Operator and contact information for Pointification, the free online scoreboard app operated by Mirza Polat in München, Germany.',
  },
  '/privacy': {
    title: 'Privacy Policy | Pointification',
    description: 'Learn how Pointification handles account details, game data, public scoreboard links and cookieless analytics, and how to contact the operator.',
  },
}

// Shown on the landing page and mirrored as FAQPage structured data, so the
// visible answers and the markup can never drift apart.
export const FAQ = [
  ['Is Pointification free?', 'Yes. Pointification is free to use. Create an account to set up games, add teams and keep score in your browser.'],
  ['What can I use the scoreboard for?', 'Use it for trivia and quiz nights, classroom team competitions, family board games or sports practice. You choose the teams and point values, so scoring can follow your own rules.'],
  ['Do spectators need an account?', 'No. Share a read-only scoreboard link so spectators can follow live scores without signing in. Anyone with the link can view that scoreboard.'],
  ['Can several people keep score together?', 'Yes. Invite collaborators by email so they can help update scores. Score changes appear live across connected devices.'],
  ['Do I need to install an app?', 'No. Pointification runs in your web browser on a phone, tablet or computer. An internet connection is needed to sync scores and follow live updates.'],
  ['Can I customize my scoreboard?', 'Yes. Choose team names and colors, upload a game logo, review point history and show a winner podium at the end.'],
]

// 1200x630 card rendered by /api/og, so link previews get a large image.
const SOCIAL_IMAGE = `${SITE_URL}/api/og?name=${encodeURIComponent('Free online scoreboard')}&subtitle=${encodeURIComponent('Live scores for quiz nights, classrooms & game nights')}`

const APP_TITLES = {
  '/login': 'Sign in', '/verify': 'Verify your account', '/welcome': 'Welcome',
  '/onboarding': 'Get started', '/account': 'Account',
}

export function pageMetadata(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'
  const publicPath = path === '/landing' ? '/' : path
  const page = Object.hasOwn(PUBLIC_PAGES, publicPath) ? PUBLIC_PAGES[publicPath] : null
  return {
    title: page?.title || `${APP_TITLES[path] || (path.startsWith('/p/') ? 'Live scoreboard' : 'App')} | Pointification`,
    description: page?.description || 'Create and manage games or follow a shared live scoreboard on Pointification.',
    canonical: page ? `${SITE_URL}${publicPath === '/' ? '/' : publicPath}` : null,
    robots: page ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    image: SOCIAL_IMAGE,
    imageWidth: 1200,
    imageHeight: 630,
    imageAlt: 'Pointification — free online scoreboard for quiz nights, classrooms and game nights',
    structuredData: publicPath === '/' ? {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'Pointification', url: `${SITE_URL}/`, inLanguage: 'en',
          publisher: { '@id': `${SITE_URL}/#operator` },
        },
        { '@type': 'Person', '@id': `${SITE_URL}/#operator`, name: 'Mirza Polat', url: `${SITE_URL}/imprint` },
        {
          '@type': 'WebApplication', '@id': `${SITE_URL}/#app`, name: 'Pointification',
          url: `${SITE_URL}/`, description: PUBLIC_PAGES['/'].description,
          applicationCategory: 'GameApplication', operatingSystem: 'Any',
          browserRequirements: 'Requires JavaScript and an internet connection.',
          isAccessibleForFree: true, inLanguage: 'en', image: `${SITE_URL}/pointification.png`,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
          featureList: ['Live team scores', 'Read-only scoreboard sharing', 'Collaborative scorekeeping', 'Custom team colors and game logos', 'Score history', 'Winner podium'],
          screenshot: `${SITE_URL}/pointification.png`,
          author: { '@id': `${SITE_URL}/#operator` },
        },
        {
          '@type': 'FAQPage', '@id': `${SITE_URL}/#faq`, isPartOf: { '@id': `${SITE_URL}/#website` },
          mainEntity: FAQ.map(([name, text]) => ({
            '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text },
          })),
        },
      ],
    } : null,
  }
}

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function renderMetadata(meta) {
  return `<title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <meta name="robots" content="${esc(meta.robots)}" />
    ${meta.canonical ? `<link rel="canonical" href="${esc(meta.canonical)}" />` : ''}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Pointification" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    ${meta.canonical ? `<meta property="og:url" content="${esc(meta.canonical)}" />` : ''}
    <meta property="og:image" content="${esc(meta.image)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${meta.imageWidth || 1200}" />
    <meta property="og:image:height" content="${meta.imageHeight || 630}" />
    <meta property="og:image:alt" content="${esc(meta.imageAlt || meta.title)}" />
    <meta name="twitter:card" content="${(meta.imageWidth || 1200) >= 1000 ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${esc(meta.title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${esc(meta.image)}" />
    <meta name="twitter:image:alt" content="${esc(meta.imageAlt || meta.title)}" />
    ${meta.structuredData ? `<script type="application/ld+json">${JSON.stringify(meta.structuredData).replace(/</g, '\\u003c')}</script>` : ''}`
}

export function applyMetadata(shell, meta) {
  return shell.replace(/<!-- SEO:start -->[\s\S]*?<!-- SEO:end -->/, () => `<!-- SEO:start -->\n${renderMetadata(meta)}\n<!-- SEO:end -->`)
}
