import { NextResponse } from 'next/server'

// we use this trick to fool static analysis at build time, so we can build a
// middleware that will return a body at run time, and check it is disallowed.
class MyResponse extends Response {}

export async function middleware(request, ev) {
  const { readable, writable } = new TransformStream()
  const url = request.nextUrl
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const next = NextResponse.next()

  // this is needed for tests to get the BUILD_ID
  if (url.pathname.startsWith('/_next/static/__BUILD_ID')) {
    return NextResponse.next()
  }

  // Header based on query param
  if (url.searchParams.get('nested-header') === 'true') {
    next.headers.set('x-nested-header', 'valid')
  }

  // Ensure deep can append to this value
  if (url.searchParams.get('append-me') === 'true') {
    next.headers.append('x-append-me', 'top')
  }

  // Ensure deep can append to this value
  if (url.searchParams.get('cookie-me') === 'true') {
    next.headers.append('set-cookie', 'bar=chocochip')
  }

  // Sends a header
  if (url.pathname === '/header') {
    next.headers.set('x-first-header', 'valid')
    return next
  }

  if (url.pathname === '/two-cookies') {
    const headers = new Headers()
    headers.append('set-cookie', 'foo=chocochip')
    headers.append('set-cookie', 'bar=chocochip')
    return new Response(null, { headers })
  }

  // Streams a basic response
  if (url.pathname === '/stream-a-response') {
    ev.waitUntil(
      (async () => {
        writer.write(encoder.encode('this is a streamed '))
        writer.write(encoder.encode('response '))
        writer.close()
      })()
    )

    return new MyResponse(readable)
  }

  if (url.pathname === '/bad-status') {
    return new Response(null, {
      headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
      status: 401,
    })
  }

  // Sends response
  if (url.pathname === '/send-response') {
    return new MyResponse(JSON.stringify({ message: 'hi!' }))
  }

  return next
}
