import { type NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl

  let originalPathname = url.pathname

  if (url.pathname.includes('/one')) {
    url.pathname = '/two/example'
  } else if (url.pathname.includes('/dynamic-test')) {
    url.pathname = '/dynamic/foo'
  }

  if (url.pathname !== originalPathname) {
    return NextResponse.rewrite(url)
  }
}

export const config = {
  matcher: ['/one/:path*', '/dynamic-test/:path*'],
}
