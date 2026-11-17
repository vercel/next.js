import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/listing/')) {
    return NextResponse.rewrite(new URL('/gone', request.url), { status: 410 })
  }

  if (request.nextUrl.pathname === '/maintenance') {
    return NextResponse.rewrite(new URL('/gone', request.url), {
      status: 503,
      headers: { 'retry-after': '60' },
    })
  }

  if (request.nextUrl.pathname === '/removed') {
    return NextResponse.rewrite(new URL('/missing', request.url), {
      status: 410,
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/listing/:path*', '/maintenance', '/removed'],
}
