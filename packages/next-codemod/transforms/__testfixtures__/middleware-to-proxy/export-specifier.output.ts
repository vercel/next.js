import { NextResponse, NextRequest } from 'next/server'

function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url))
}

const config = {
  matcher: '/about/:path*',
}

export { proxy, config }