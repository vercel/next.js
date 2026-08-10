import { NextResponse } from 'next/server'

// A fixed nonce keeps the test deterministic. Real apps use a fresh
// per-request nonce (e.g. via crypto.randomUUID()).
const nonce = 'test-nonce'
const csp = `script-src 'nonce-${nonce}'`

export function middleware(request) {
  // Pages Router's SSR renderer reads the nonce back out of the request's
  // own Content-Security-Policy header, so it has to be set on the
  // outgoing request (not just the response the browser sees).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}
