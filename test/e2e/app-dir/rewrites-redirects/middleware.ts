import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/middleware-rewrite-before')) {
    return NextResponse.rewrite(
      new URL('/middleware-rewrite-after', request.url)
    )
  }

  if (request.nextUrl.pathname.startsWith('/middleware-redirect-before')) {
    return NextResponse.redirect(
      new URL('/middleware-redirect-after', request.url)
    )
  }
}
