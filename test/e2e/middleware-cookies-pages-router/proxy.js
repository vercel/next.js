import { NextResponse } from 'next/server'

export function proxy(request) {
  const res = NextResponse.next()

  if (request.nextUrl.pathname === '/') {
    res.cookies.set('from-middleware', 'hello')
    return res
  }

  if (request.nextUrl.pathname === '/multiple') {
    res.cookies.set('cookie-1', 'value-1')
    res.cookies.set('cookie-2', 'value-2')
    return res
  }

  if (request.nextUrl.pathname === '/api/test') {
    res.cookies.set('api-cookie', 'api-value')
    return res
  }

  return res
}
