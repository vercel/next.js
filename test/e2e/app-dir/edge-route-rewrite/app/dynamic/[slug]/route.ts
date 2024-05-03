export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export function GET(req, { params }) {
  return new Response(
    `Hello from /app/dynamic/[slug]/route.ts. Slug: ${params.slug}`
  )
}
