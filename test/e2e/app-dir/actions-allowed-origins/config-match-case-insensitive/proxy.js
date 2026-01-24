import { NextResponse } from 'next/server'
import { ORIGIN_DOMAIN } from './domain'

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
  // Set origin header to lowercase 'example.com' to test case-insensitive matching
  // against CONFIG_ALLOWED_ORIGINS which uses different casing ('Example.COM').
  requestHeaders.set('origin', ORIGIN_DOMAIN)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}
