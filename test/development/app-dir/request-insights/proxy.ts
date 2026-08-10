import { type NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === '/request-insights-asset.svg' &&
    request.nextUrl.searchParams.has('rewrite-to-page')
  ) {
    return NextResponse.rewrite(new URL('/behind-proxy', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/request-insights-asset.svg'],
}
