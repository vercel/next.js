import { NextResponse } from 'next/server'

export function middleware(request: Request) {
  return NextResponse.rewrite(new URL('/render/next', request.url))
}
