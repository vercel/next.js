import { NextResponse } from 'next/server'
import { ORIGIN_DOMAIN, X_FORWARDED_HOST } from './domain'

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
  requestHeaders.set('origin', `https://${ORIGIN_DOMAIN}`)

  // Production proxies (e.g. Nginx/Cloudflare) can send a mis-cased host.
  // This proxy intentionally reproduces that by setting x-forwarded-host with caps.
  requestHeaders.set('x-forwarded-host', X_FORWARDED_HOST)

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
