import { NextResponse } from 'next/server'

export function proxy(request) {
  const response = NextResponse.next()
  const { pathname } = request.nextUrl

  if (pathname === '/cached') {
    response.cookies.set('user', request.headers.get('x-user'), { path: '/' })
    return response
  }

  response.cookies.set('from-proxy', 'fast', { path: '/' })

  if (pathname === '/secure-edge') {
    response.cookies.set('session', 'secret', { maxAge: 3600, path: '/' })
  }

  return response
}
