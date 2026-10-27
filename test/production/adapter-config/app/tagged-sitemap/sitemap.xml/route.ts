import { unstable_cache } from 'next/cache'

export const dynamic = 'force-static'

const getUrls = unstable_cache(
  async () => [`https://example.com/${Date.now()}`],
  ['adapter-config:tagged-sitemap'],
  { tags: ['adapter-config:tagged-sitemap'] }
)

export async function GET() {
  const urls = await getUrls()
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`,
    { headers: { 'content-type': 'application/xml' } }
  )
}
