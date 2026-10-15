import type { NextRequest, NextFetchEvent } from 'next/server'
import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/behind-middleware', '/behind-middleware/:path*'],
  runtime: 'nodejs',
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
  return NextResponse.next()
}
