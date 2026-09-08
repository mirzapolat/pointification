import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { pageMetadata, renderMetadata } from '../../server/seo.js'

// Keep metadata accurate after React Router navigation as well as HTTP loads.
export default function PageMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    // Preserve a direct share request's game-specific server metadata.
    const shareUrl = document.head.querySelector('meta[property="og:url"]')?.content
    if (pathname.startsWith('/p/') && shareUrl === `${window.location.origin}${pathname}`) return
    const template = document.createElement('template')
    template.innerHTML = renderMetadata(pageMetadata(pathname))
    document.head.querySelectorAll('title, meta[name="description"], meta[name="robots"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"], script[type="application/ld+json"]').forEach(node => node.remove())
    document.head.append(template.content)
  }, [pathname])
  return null
}
