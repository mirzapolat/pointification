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
    image: `${SITE_URL}/pointification.png`,
    structuredData: publicPath === '/' ? {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'Pointification', url: `${SITE_URL}/`, inLanguage: 'en' },
        {
          '@type': 'WebApplication', '@id': `${SITE_URL}/#app`, name: 'Pointification',
          url: `${SITE_URL}/`, description: PUBLIC_PAGES['/'].description,
          applicationCategory: 'GameApplication', operatingSystem: 'Any',
          browserRequirements: 'Requires JavaScript and an internet connection.',
          isAccessibleForFree: true, inLanguage: 'en', image: `${SITE_URL}/pointification.png`,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
          featureList: ['Live team scores', 'Read-only scoreboard sharing', 'Collaborative scorekeeping', 'Custom team colors and game logos', 'Score history', 'Winner podium'],
          author: { '@type': 'Person', name: 'Mirza Polat', url: `${SITE_URL}/imprint` },
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
    <meta property="og:image:width" content="${meta.imageWidth || 500}" />
    <meta property="og:image:height" content="${meta.imageHeight || 500}" />
    <meta property="og:image:alt" content="${esc(meta.title)}" />
    <meta name="twitter:card" content="${meta.imageWidth === 1200 ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${esc(meta.title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${esc(meta.image)}" />
    ${meta.structuredData ? `<script type="application/ld+json">${JSON.stringify(meta.structuredData).replace(/</g, '\\u003c')}</script>` : ''}`
}

export function applyMetadata(shell, meta) {
  return shell.replace(/<!-- SEO:start -->[\s\S]*?<!-- SEO:end -->/, () => `<!-- SEO:start -->\n${renderMetadata(meta)}\n<!-- SEO:end -->`)
}
