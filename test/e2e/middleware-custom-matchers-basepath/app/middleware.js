import { NextResponse } from 'next/server'

export default function middleware(request) {
  request.nextUrl.pathname = '/'
  const res = NextResponse.rewrite(request.nextUrl)
  res.headers.set('X-From-Middleware', 'true')
  return res
}

export const config = {
  matcher: [
    {
      source: '/hello',
    },
    {
      source: '/docs/about',
      basePath: false,
    },
  ],
}
