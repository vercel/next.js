export const revalidate = 60

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/${slug}</loc>
    <lastmod>${Date.now()}</lastmod>
  </url>
</urlset>`,
    { headers: { 'content-type': 'application/xml' } }
  )
}
