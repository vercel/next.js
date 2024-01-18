export function GET() {
  return new Response(JSON.stringify({ name: 'John Doe' }))
}

export const dynamic = 'force-dynamic'
