export const revalidate = 60

export async function GET() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/${Date.now()}</loc></url></urlset>`,
    { headers: { 'content-type': 'application/xml' } }
  )
}
