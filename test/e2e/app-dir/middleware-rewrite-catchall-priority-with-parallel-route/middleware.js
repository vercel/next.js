import { NextResponse } from 'next/server'

export async function middleware(request) {
  if (
    request.nextUrl.pathname.includes('payment') &&
    !request.nextUrl.pathname.includes('whoops')
  ) {
    if (request.nextUrl.searchParams.has('redirect')) {
      return NextResponse.redirect(new URL('/payment/whoops', request.url))
    }
    return NextResponse.rewrite(new URL('/payment/whoops', request.url))
  }
  if (
    request.nextUrl.pathname.includes('anotherRoute') &&
    !request.nextUrl.pathname.includes('whoops')
  ) {
    if (request.nextUrl.searchParams.has('redirect')) {
      return NextResponse.redirect(new URL('/anotherRoute/whoops', request.url))
    }
    return NextResponse.rewrite(new URL('/anotherRoute/whoops', request.url))
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
