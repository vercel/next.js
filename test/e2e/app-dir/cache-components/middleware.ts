import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith('/headers/') ||
    request.nextUrl.pathname.endsWith('dynamic_api_headers')
  ) {
    // Clone the request headers and set a new header `x-hello-from-middleware1`
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-sentinel', 'hello')
    requestHeaders.set('x-sentinel-path', request.nextUrl.pathname)
    requestHeaders.set(
      'x-sentinel-rand',
      ((Math.random() * 100000) | 0).toString(16)
    )

    return NextResponse.next({
      request: {
        // New request headers
        headers: requestHeaders,
      },
    })
  }

  const response = NextResponse.next()

  if (
    request.nextUrl.pathname.startsWith('/cookies/') ||
    request.nextUrl.pathname.endsWith('dynamic_api_cookies')
  ) {
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
  }

  return response
}
