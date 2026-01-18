import { NextResponse } from 'next/server'

export async function proxy(request) {
  if (request.method !== 'POST') {
    return NextResponse.next()
  }

  const isServerAction = request.headers.get('next-action')
  if (!isServerAction) {
    return NextResponse.next()
  }

  const requestHeaders = new Headers(request.headers)

  // To keep E2E tests consistent, set the origin to a fixed domain
  // fixed domain is example.com
  requestHeaders.set('origin', 'https://example-domain.com:443')

  // Production proxies (e.g. Nginx/Cloudflare) can send a mis-cased host.
  // This proxy intentionally reproduces that by setting x-forwarded-host with caps.
  requestHeaders.set('x-forwarded-host', 'Example-Domain.com')

  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const xForwardedHost = request.headers.get('x-forwarded-host')
  console.log(
    'origin:',
    origin,
    'host:',
    host,
    'x-forwarded-host:',
    xForwardedHost
  )

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}
