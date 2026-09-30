import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const nonce = 'image-blur-test-nonce'
  const scripts = `'nonce-${nonce}' 'strict-dynamic'`
  const styleNonce =
    request.nextUrl.pathname === '/blocked-style'
      ? 'different-style-nonce'
      : nonce
  // The development overlay injects styles without a nonce. Enforce nonce-only
  // styles in production, and keep the explicit blocked-style case strict in
  // both modes. The bootstrap's nonce attribute is asserted in both modes.
  const styleElements =
    process.env.NODE_ENV === 'development' &&
    request.nextUrl.pathname !== '/blocked-style'
      ? "'unsafe-inline'"
      : `'nonce-${styleNonce}'`
  const csp = `default-src 'self'; script-src ${scripts} ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; style-src-elem 'self' ${styleElements}; img-src 'self' data:; connect-src 'self' ws: wss:`
  const headers = new Headers(request.headers)
  headers.set('Content-Security-Policy', csp)
  headers.set('x-nonce', nonce)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: ['/csp', '/csp-pages', '/blocked-bootstrap', '/blocked-style'],
}
