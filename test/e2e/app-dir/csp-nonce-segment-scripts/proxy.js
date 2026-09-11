import { NextResponse } from 'next/server'

export function proxy(request) {
  const nonce = 'test-nonce'
  const csp = `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'; style-src 'self' 'unsafe-inline'`

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}
