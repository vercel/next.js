import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.includes('[') ||
    request.nextUrl.pathname.includes(']')
  ) {
    return new Response('Unencoded brackets in request path', { status: 400 })
  }
  return NextResponse.next()
}

export const config = { matcher: '/items/:path*' }
