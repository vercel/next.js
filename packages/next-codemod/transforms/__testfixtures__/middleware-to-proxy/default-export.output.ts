import { NextResponse, NextRequest } from 'next/server'

// default export name doesn't matter
export default function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url))
}

export const config = {
  matcher: '/about/:path*',
}