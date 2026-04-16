import { NextResponse, NextRequest } from 'next/server'

function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url))
}

const config = {
  matcher: '/about/:path*',
}

export { middleware, config }