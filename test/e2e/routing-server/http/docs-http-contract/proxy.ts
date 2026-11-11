import type { NextFetchEvent, NextRequest } from 'next/server'

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const origin = process.env.ROUTING_TEST_CONTROL_ORIGIN
  const id = encodeURIComponent(request.nextUrl.searchParams.get('id')!)
  event.waitUntil(
    (async () => {
      const barrier = await fetch(`${origin}/${id}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      })
      await barrier.text()
      const completion = await fetch(`${origin}/completed/${id}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      })
      await completion.text()
    })()
  )
  return new Response('response finished\n', {
    headers: { 'content-type': 'text/plain' },
  })
}

export const config = { matcher: '/background-work' }
