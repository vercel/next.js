import { NextResponse, NextRequest } from 'next/server'

const middleware = (request: NextRequest) => {
  return NextResponse.redirect(new URL('/home', request.url))
}

export { middleware }

export const config = {
  matcher: '/about/:path*',
}