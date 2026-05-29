import { NextResponse } from 'next/server'

export default function middleware(_) {
  const res = NextResponse.next()
  res.headers.set('X-From-Middleware', 'true')
  return res
}

export const config = { matcher: '/random' }
