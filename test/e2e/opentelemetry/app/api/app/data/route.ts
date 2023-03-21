export async function GET() {
  return new Response(JSON.stringify({ test: 'data' }))
}
