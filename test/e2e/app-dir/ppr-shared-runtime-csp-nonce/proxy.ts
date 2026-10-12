import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('csp')
  if (mode === 'none') {
    return NextResponse.next()
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'`
  const header =
    mode === 'report-only'
      ? 'content-security-policy-report-only'
      : 'content-security-policy'

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(header, csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(header, csp)
  return response
}

export const config = {
  // Fully static pages are not compatible with a nonce-based CSP (their inline
  // Flight data can't carry a per-request nonce), so `/static` is served
  // without one.
  matcher: ['/((?!static|_next).*)'],
}
