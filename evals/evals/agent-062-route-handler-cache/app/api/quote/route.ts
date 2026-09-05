export async function GET() {
  // Expensive upstream lookup on every hit.
  await new Promise((r) => setTimeout(r, 400))
  const quote = { text: 'Ship it.', source: 'ops' }
  return Response.json(quote)
}

export async function POST(request: Request) {
  const body = await request.json()
  return Response.json({ received: body })
}
