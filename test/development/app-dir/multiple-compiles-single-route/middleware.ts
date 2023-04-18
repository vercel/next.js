import { NextRequest, NextResponse } from 'next/server'

export default function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/about') {
    return NextResponse.rewrite(new URL('/new-about', request.nextUrl))
  }
}
