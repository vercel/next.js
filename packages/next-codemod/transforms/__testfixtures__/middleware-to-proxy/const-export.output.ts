import { NextResponse, NextRequest } from 'next/server'

const proxy = (request: NextRequest) => {
  return NextResponse.redirect(new URL('/home', request.url))
}

export { proxy }

export const config = {
  matcher: '/about/:path*',
}