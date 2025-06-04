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
  const url = new URL(req.url)

  if (url.pathname === '/hello/wyatt') {
    return NextResponse.rewrite(new URL('/hello/admin?key=value', url))
  }

  if (url.pathname === '/hello/bob') {
    return NextResponse.rewrite(new URL('/hello/bobby', url))
  }

  if (url.pathname === '/hello/john') {
    return NextResponse.rewrite(new URL('/hello/john?key=value', url))
  }

  if (url.pathname === '/hello/vercel') {
    return NextResponse.rewrite('https://www.vercel.com')
  }

  return NextResponse.next()
}
