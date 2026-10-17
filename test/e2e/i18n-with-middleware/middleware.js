import { NextResponse } from 'next/server'

export function middleware(request) {
  return NextResponse.rewrite(new URL('/foo', request.url))
}

export const config = {
  matcher: '/does-not-match-in-test',
}
