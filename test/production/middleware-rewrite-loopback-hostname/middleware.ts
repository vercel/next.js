import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/a') {
    return NextResponse.rewrite(new URL('/b', request.url))
  }
}
