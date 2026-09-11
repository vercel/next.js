import { NextResponse } from 'next/server'
import { getKey } from './lib/barrel'

export function middleware() {
  const k = getKey()
  const res = NextResponse.next()
  res.headers.set('x-key', k)
  return res
}

export const config = {
  runtime: 'nodejs',
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
