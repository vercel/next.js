import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/with-middleware/:path*', '/another-middleware/:path*'],
}

export default (req) => {
  const res = NextResponse.next()
  res.headers.set('X-From-Middleware', 'true')
  return res
}
