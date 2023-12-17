import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/catch/middleware-rewrite-before')) {
    return NextResponse.rewrite(
      new URL('/catch/middleware-rewrite-after', request.url)
    )
  }

  if (
    request.nextUrl.pathname.startsWith('/catch/middleware-redirect-before')
  ) {
    return NextResponse.redirect(
      new URL('/catch/middleware-redirect-after', request.url)
    )
  }
}
