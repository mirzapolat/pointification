import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { render } from '../.vite/prerender/entry-prerender.js'
import { PUBLIC_PAGES, SITE_URL, applyMetadata, pageMetadata } from '../server/seo.js'

const shell = await readFile('dist/index.html', 'utf8')
await mkdir('dist/prerender', { recursive: true })
for (const pathname of Object.keys(PUBLIC_PAGES)) {
  const html = applyMetadata(shell, pageMetadata(pathname))
    .replace('<div id="root"></div>', () => `<div id="root" data-prerendered="true">${render(pathname)}</div>`)
  const name = pathname === '/' ? 'index' : pathname.slice(1)
  await writeFile(`dist/prerender/${name}.html`, html)
}
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.keys(PUBLIC_PAGES).map(path => `  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n')}
</urlset>\n`)
console.log(`Pre-rendered ${Object.keys(PUBLIC_PAGES).length} public pages and sitemap.`)
