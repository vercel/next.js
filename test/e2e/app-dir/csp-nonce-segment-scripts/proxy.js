import { NextResponse } from 'next/server'

export function proxy(request) {
  const nonce = 'test-nonce'
  const csp = `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'; style-src 'self' 'unsafe-inline'`
  const headerName =
    request.nextUrl.searchParams.get('csp') === 'report-only'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy'

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(headerName, csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(headerName, csp)
  return response
}
