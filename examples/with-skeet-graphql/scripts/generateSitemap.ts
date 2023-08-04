import fs from 'fs'
import globby from 'globby'
import siteConfig from '../src/config/site'

const { domain } = siteConfig
const distDir = 'web-build'

async function generateSiteMap() {
  const pages = await globby([
    `${distDir}/en.html`,
    `${distDir}/ja.html`,
    `${distDir}/en/**/*.html`,
    `${distDir}/ja/**/*.html`,
  ])
  console.log(pages)

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">   
      ${pages
        .filter((page) => !page.includes('404') && !page.includes('500'))
        .map((page) => {
          const path = page
            .replace(distDir, '')
            .replace('/index', '')
            .replace('.html', '')
          return `
  <url>
    <loc>${`https://${domain}${path}/`}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
              `
        })
        .join('')}
</urlset>
  `

  fs.writeFileSync('web-build/sitemap.xml', sitemap)
}

generateSiteMap()
