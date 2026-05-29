import { NextResponse, NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url))
}

const config = {
  matcher: '/api/:path*',
}

export { config };