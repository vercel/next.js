import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    return NextResponse.next({
      headers: {
        link: '<https://example.com>; rel="alternate"; hreflang="x-default"',
        'x-link':
          '<https://example.com>; rel="alternate"; hreflang="x-default"',
      },
    })
  }
}
