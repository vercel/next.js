import { NextResponse } from 'next/server'

export function proxy(request) {
  const response = NextResponse.next()
  const { pathname } = request.nextUrl

  if (pathname === '/forged') {
    return response
  }

  response.cookies.set('from-proxy', 'fast', { path: '/' })

  if (pathname.startsWith('/override')) {
    response.cookies.set('session', 'from-proxy', { path: '/' })
  }

  if (pathname.startsWith('/drop')) {
    response.cookies.delete('session')
  }

  if (pathname.startsWith('/percent')) {
    response.cookies.set('percent', '100%', { path: '/' })
  }

  if (pathname.startsWith('/secure')) {
    response.cookies.set('session', 'secret', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    })
  }

  return response
}
