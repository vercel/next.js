import { NextResponse, NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url))
}

export const runtime = 'edge'

export const config = {
  matcher: '/about/:path*',
}