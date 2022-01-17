import { NextResponse } from 'next/server'

export function middleware(request) {
  return NextResponse.rewrite(new URL('/about/a', request.url))
}
