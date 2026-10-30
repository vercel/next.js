import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // A strict gateway-style CSP: no nonce, hash, or 'unsafe-inline'. Mirrors
  // https://github.com/vercel/next.js/issues/100906, where the policy is set
  // by an external CDN/gateway the app cannot control.
  const csp = [`default-src 'self'`, `script-src 'self'`].join('; ')

  const response = NextResponse.next()
  response.headers.set('content-security-policy', csp)
  return response
}

export const config = {
  matcher: ['/((?!_next).*)'],
}
