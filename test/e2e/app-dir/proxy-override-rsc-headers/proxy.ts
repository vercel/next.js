import { NextResponse, type NextRequest } from 'next/server'

// Overrides a request header that the client's `_rsc` search param is a hash
// of, like a proxy that stamps the requested path onto every request.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('next-url', request.nextUrl.pathname)
  requestHeaders.set('x-middleware-stamp', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
