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
  requestHeaders.set('origin', ORIGIN_DOMAIN)

  // Production proxies (e.g. Nginx/Cloudflare) can send a mis-cased host.
  // This proxy intentionally reproduces that by setting x-forwarded-host with caps.
  requestHeaders.set('x-forwarded-host', X_FORWARDED_HOST)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}
