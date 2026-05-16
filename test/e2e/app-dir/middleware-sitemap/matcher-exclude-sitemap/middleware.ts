import { NextResponse } from 'next/server'

export default function (request) {
  if (request.nextUrl.pathname !== '/redirected') {
    return NextResponse.redirect(new URL('/redirected', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!sitemap.xml).*)'],
}
