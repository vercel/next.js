import { NextResponse } from 'next/server'

export default function middleware(request) {
  const nextUrl = request.nextUrl.clone()
  nextUrl.pathname = '/'
  const res = NextResponse.rewrite(nextUrl)
  res.headers.set('X-From-Middleware', 'true')
  return res
}

export const config = {
  matcher: [
    {
      source: '/hello',
    },
  ],
}
