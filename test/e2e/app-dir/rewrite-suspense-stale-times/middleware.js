import { NextResponse } from 'next/server'

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

export default function middleware(req) {
  if (
    req.nextUrl.pathname.startsWith('/a') ||
    req.nextUrl.pathname.startsWith('/b')
  ) {
    return NextResponse.next()
  }

  const variant = req.cookies.get('variant')?.value ?? 'a'

  return NextResponse.rewrite(
    new URL(
      `/${variant}${req.nextUrl.pathname}${req.nextUrl.search}`,
      req.url
    ).toString()
  )
}
