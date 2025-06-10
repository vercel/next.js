import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/old-about') {
    const url = request.nextUrl.clone()
    url.pathname = '/about'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}
