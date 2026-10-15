export async function GET() {
  return new Response(JSON.stringify({ behind: 'middleware' }))
}

export const dynamic = 'force-dynamic'
