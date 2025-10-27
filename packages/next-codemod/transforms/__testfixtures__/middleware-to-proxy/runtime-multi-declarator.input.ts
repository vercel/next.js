import { NextResponse, NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url))
}

const runtime = 'edge', config = { matcher: '/test/*' }
export { runtime, config }