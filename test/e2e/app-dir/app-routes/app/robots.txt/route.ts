export async function GET() {
  return new Response(`User-agent: *
Allow: /

Sitemap: https://www.example.com/sitemap.xml`)
}
