export async function GET() {
  return new Response(JSON.stringify({ test: 'data' }), { status: 418 })
}

export const dynamic = 'force-dynamic'
