import { NextResponse } from 'next/server'

export default function () {
  const response = NextResponse.next()
  response.headers.set('X-From-Middleware', 'true')
  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
