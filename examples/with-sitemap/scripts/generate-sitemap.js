const fs = require('fs')

const globby = require('globby')

const WEBSITE_URL = 'http://localhost:3000'

;(async () => {
  // Ignore Next.js specific files (e.g., _app.js) and API routes.
  const pages = await globby([
    'pages/**/*{.js,.mdx}',
    '!pages/_*.js',
    '!pages/api',
  ])
  const sitemap = `
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            ${pages
              .map((page) => {
                const path = page
                  .replace('pages', '')
                  .replace('.js', '')
                  .replace('.mdx', '')
                const route = path === '/index' ? '' : path

                return `
                        <url>
                            <loc>${`${WEBSITE_URL}${route}`}</loc>
                        </url>
                    `
              })
              .join('')}
              </urlset>
    `

  fs.writeFileSync('public/sitemap.xml', sitemap)
})()
