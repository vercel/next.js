import { NextResponse } from 'next/server'

export const config = {
  matcher: [
    '/',
    '/with-middleware/:path*',
    '/another-middleware/:path*',
    // the below is testing special characters don't break the build
    '/_sites/:path((?![^/]*\\.json$)[^/]+$)',
  ],
}

export default (req) => {
  const res = NextResponse.next()
  res.headers.set('X-From-Middleware', 'true')
  return res
}
