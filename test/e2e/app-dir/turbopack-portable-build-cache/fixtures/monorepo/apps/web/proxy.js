import { NextResponse } from 'next/server'

export function proxy() {
  const response = NextResponse.next()
  response.headers.set('x-portable-proxy', '1')
  return response
}

export const config = {
  matcher: '/api/:path*',
}
