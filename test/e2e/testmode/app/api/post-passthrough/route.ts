export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const target = url.searchParams.get('target')
  if (!target) {
    return new Response('missing target', { status: 400 })
  }
  const resp = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  })
  const text = await resp.text()
  return new Response(JSON.stringify({ echoed: text }))
}
