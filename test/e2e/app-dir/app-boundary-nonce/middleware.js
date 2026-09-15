import { NextResponse } from 'next/server'

const nonce = 'boundary-nonce-test'

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
    process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  }`,
  `style-src 'self' 'nonce-${nonce}'`,
].join('; ')

export function middleware(request) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', csp)
  return response
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
