import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  console.log('middleware called')
  if (request.nextUrl.pathname === '/old-about') {
    const url = request.nextUrl.clone()
    url.pathname = '/about'
    console.log('redirecting to', url.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}
