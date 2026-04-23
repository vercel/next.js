import { NextResponse } from 'next/server'

const segments = ['dashboard', 'settings']

export const config = {
  matcher: ['/', `/(${segments.join('|')})/:path*`],
}

export default (req) => {
  const res = NextResponse.next()
  res.headers.set('X-From-Middleware', 'true')
  return res
}
