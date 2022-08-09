import { NextResponse } from 'next/server'

export default function middleware(request) {
  const res = NextResponse.rewrite(new URL('/', request.url))
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
