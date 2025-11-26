// custom /sitemap route, with xml content
export function GET() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
      <loc>https://example.com</loc>
      <lastmod>2021-01-01</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.5</priority>
      </url>
      </urlset>
    `.trim(),
    {
      headers: {
        'Content-Type': 'application/xml',
      },
    }
  )
}
