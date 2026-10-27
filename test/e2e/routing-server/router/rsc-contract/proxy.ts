import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// R15: deliberately omit a matcher. proxy.mdx says this includes framework
// endpoints and public files, not only pages and application handlers.
export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set('x-contract-proxy-path', request.nextUrl.pathname)
  return response
}
