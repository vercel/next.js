import { NextResponse } from 'next/server'

export function middleware(request) {
  const res = NextResponse.rewrite(new URL('/', request.url))
  res.headers.set('X-From-Middleware', 'true')
  return res
}
