const CAUSAL_COOKIE = '__next_request_insights_causal='

export const runtime = 'edge'

function isCausalCookieVisible(request: Request): boolean {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .some((cookie) => cookie.trim().startsWith(CAUSAL_COOKIE))
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ step: string }> }
) {
  const { step } = await params
  if (step === 'one') {
    const response = await fetch(new URL('/api/edge-causal/two', request.url))
    return Response.json(await response.json())
  }

  if (step === 'external') {
    const target = new URL(request.url).searchParams.get('target')!
    try {
      const response = await fetch(target, {
        headers: {
          cookie: `${CAUSAL_COOKIE}caller-value; user=value`,
        },
      })
      return new Response(await response.text(), { status: response.status })
    } catch {
      return new Response('fetch failed', { status: 502 })
    }
  }

  return Response.json({
    causalCookieVisible: isCausalCookieVisible(request),
    step,
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ step: string }> }
) {
  const { step } = await params
  const body = await request.text()
  if (step === 'one') {
    const bytes = new TextEncoder().encode(body)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
    const response = await fetch(new URL('/api/edge-causal/two', request.url), {
      method: 'POST',
      body: stream,
      // Required by the host fetch implementation for streaming bodies.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    return Response.json(await response.json())
  }

  return Response.json({
    body,
    causalCookieVisible: isCausalCookieVisible(request),
    step,
  })
}
