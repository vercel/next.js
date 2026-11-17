import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rewrites two public paths onto one statically prerendered page, each with
// its own response status. The target page itself stays 200.
export function proxy(request: NextRequest) {
  const gone = new URL('/gone', request.url)

  if (request.nextUrl.pathname.startsWith('/listing/')) {
    return NextResponse.rewrite(gone, { status: 410 })
  }

  if (request.nextUrl.pathname === '/maintenance') {
    return NextResponse.rewrite(gone, {
      status: 503,
      headers: { 'retry-after': '120' },
    })
  }
}

export const config = {
  matcher: ['/listing/:path*', '/maintenance'],
}
