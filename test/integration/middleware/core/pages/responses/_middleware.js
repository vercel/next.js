import { NextResponse } from 'next/server'
import { getText } from '../../lib/utils'

export async function middleware(request, ev) {
  // eslint-disable-next-line no-undef
  const { readable, writable } = new TransformStream()
  const url = request.nextUrl
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const next = NextResponse.next()

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
  if (url.pathname === '/responses/header') {
    next.headers.set('x-first-header', 'valid')
    return next
  }

  if (url.pathname === '/responses/two-cookies') {
    const headers = new Headers()
    headers.append('set-cookie', 'foo=chocochip')
    headers.append('set-cookie', 'bar=chocochip')
    return new Response(null, { headers })
  }

  // Streams a basic response
  if (url.pathname === '/responses/stream-a-response') {
    ev.waitUntil(
      (async () => {
        writer.write(encoder.encode('this is a streamed '))
        writer.write(encoder.encode('response '))
        writer.write(encoder.encode(getText()))
        writer.close()
      })()
    )

    return new Response(readable)
  }

  if (url.pathname === '/responses/bad-status') {
    return new Response(null, {
      headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
      status: 401,
    })
  }

  // Sends response
  if (url.pathname === '/responses/send-response') {
    return new Response(JSON.stringify({ message: 'hi!' }))
  }

  return next
}
