import { NextResponse } from 'next/server'

export function middleware(request) {
  if (request.nextUrl.pathname.startsWith('/middleware-redirect')) {
    return NextResponse.redirect(new URL('/action-after-redirect', request.url))
  }
}

export const matcher = ['/middleware-redirect']
