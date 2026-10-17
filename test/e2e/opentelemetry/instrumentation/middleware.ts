import type { NextRequest, NextFetchEvent } from 'next/server'
import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/behind-middleware', '/behind-middleware/:path*'],
}

export async function middleware(
  request: NextRequest,
  event?: NextFetchEvent
): Promise<Response> {
  const { pathname } = request.nextUrl
  if (pathname === '/behind-middleware/rewrite') {
    // Keep the query string so tests can correlate the rewritten render.
    const url = request.nextUrl.clone()
    url.pathname = '/behind-middleware'
    return NextResponse.rewrite(url)
  }
  if (pathname === '/behind-middleware/redirect') {
    return NextResponse.redirect(new URL('/behind-middleware', request.url))
  }
  if (pathname === '/behind-middleware/user-traceparent') {
    // A traceparent the middleware explicitly sets for the render.
    const url = request.nextUrl.clone()
    url.pathname = '/behind-middleware'
    const headers = new Headers(request.headers)
    headers.set(
      'traceparent',
      '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
    )
    return NextResponse.rewrite(url, { request: { headers } })
  }
  return NextResponse.next()
}
