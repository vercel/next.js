import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  return NextResponse.rewrite(
    new URL(`/en/r/123${pathname}${search}`, request.url)
  )
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico).*)'],
}
