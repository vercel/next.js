import { type NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.has('proxy-fetch')) {
    await fetch(new URL('/request-insights-asset.svg', request.url))
  }

  if (
    request.nextUrl.pathname === '/request-insights-asset.svg' &&
    request.nextUrl.searchParams.has('rewrite-to-page')
  ) {
    return NextResponse.rewrite(new URL('/behind-proxy', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/proxied', '/request-insights-asset.svg'],
}
