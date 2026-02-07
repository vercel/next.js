export function GET() {
  return new Response(
    `
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://nextjs.org</loc>
    <lastmod>2025-01-01T00:00:00.000Z</lastmod>
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
