import { NextResponse } from 'next/server'

export default function middleware(req) {
  if (!req.nextUrl.pathname.startsWith('/en')) {
    return NextResponse.rewrite(new URL(`/en${req.nextUrl.pathname}`, req.url))
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|favicon|.well-known|auth|sitemap|robots.txt|files).*)',
  ],
}
