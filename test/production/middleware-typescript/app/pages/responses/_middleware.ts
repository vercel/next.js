import { NextMiddleware, NextResponse } from 'next/server'

export const middleware: NextMiddleware = async function (request, ev) {
  // eslint-disable-next-line no-undef
  const { readable, writable } = new TransformStream()
  const url = request.nextUrl
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const next = NextResponse.next()

  // Header based on query param
  if (url.searchParams.get('set-header') === 'true') {
    next.headers.set('x-set-header', 'valid')
  }

  // Streams a basic response
  if (url.pathname === '/responses/stream-a-response') {
    ev.waitUntil(
      (async () => {
        writer.write(encoder.encode('this is a streamed '))
        writer.write(encoder.encode('response'))
        writer.close()
      })()
    )

    return new Response(readable)
  }

  if (url.pathname === '/responses/bad-status') {
    return new Response('Auth required', {
      headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
      status: 401,
    })
  }

  // Sends response
  if (url.pathname === '/responses/send-response') {
    return new NextResponse(JSON.stringify({ message: 'hi!' }))
  }

  return next
}
