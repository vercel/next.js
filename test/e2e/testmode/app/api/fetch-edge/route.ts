export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export async function GET() {
  const text = await (await fetch('https://example.com')).text()
  return new Response(JSON.stringify({ text }))
}
