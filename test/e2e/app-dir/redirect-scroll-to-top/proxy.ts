import { NextResponse, type NextRequest } from 'next/server'

// Redirects paths without a locale prefix to the `en` locale, e.g.
// /about -> /en/about.
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    return NextResponse.next()
  }
  return NextResponse.redirect(new URL(`/en${pathname}`, request.url), 308)
}

export const config = {
  matcher: '/((?!_next|favicon.ico).*)',
}
