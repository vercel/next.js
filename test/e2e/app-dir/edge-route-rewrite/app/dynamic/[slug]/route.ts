export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET(req, props) {
  const params = await props.params
  return new Response(
    `Hello from /app/dynamic/[slug]/route.ts. Slug: ${params.slug}`
  )
}
