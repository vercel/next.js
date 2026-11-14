import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/listing/')) {
    return NextResponse.rewrite(new URL('/gone', request.url), {
      status: 410,
    })
  }

  if (request.nextUrl.pathname === '/maintenance') {
    return NextResponse.rewrite(new URL('/gone', request.url), {
      status: 503,
      headers: {
        'retry-after': '60',
      },
    })
  }
}
