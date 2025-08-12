import { NextResponse } from 'next/server'

export function middleware(request) {
  request.nextUrl.pathname = `/no-variant${request.nextUrl.pathname}`
  return NextResponse.rewrite(request.nextUrl)
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ['/', '/shop', '/product', '/who-we-are', '/about', '/contact'],
}
