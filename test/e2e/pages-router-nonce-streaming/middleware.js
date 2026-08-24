import { NextResponse } from 'next/server'

const nonce = 'test-nonce'
const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'`

export function middleware(request) {
  // The renderer reads the nonce off the *request* CSP header, while the browser
  // needs it on the response, so both are set here.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: '/:path*',
}
