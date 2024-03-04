export async function GET() {
  return new Response(JSON.stringify({ test: 'data-edge' }))
}

export const runtime = 'edge'
export const dynamic = 'force-dynamic'
