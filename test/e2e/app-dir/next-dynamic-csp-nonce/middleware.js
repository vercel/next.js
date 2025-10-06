import { NextResponse } from 'next/server'

export function middleware(request) {
  const response = NextResponse.next()
  const nonce = 'test-nonce'
  response.headers.set('x-nonce', nonce)
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'`
  )
  return response
}

export const config = {
  matcher: '/:path*',
}
