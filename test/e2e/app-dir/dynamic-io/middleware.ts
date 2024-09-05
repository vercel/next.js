import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.cookies.set('x-sentinel', 'hello', {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  })
  response.cookies.set('x-sentinel-path', request.nextUrl.pathname, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  })
  response.cookies.set(
    'x-sentinel-rand',
    ((Math.random() * 100000) | 0).toString(16),
    {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    }
  )
  return response
}
