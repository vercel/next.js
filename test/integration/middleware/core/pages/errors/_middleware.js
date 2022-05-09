import { NextResponse } from 'next/server'

export async function middleware(request) {
  const url = request.nextUrl

  if (
    url.pathname === '/errors/throw-on-preflight' &&
    request.headers.has('x-middleware-preflight')
  ) {
    throw new Error('test error')
  }

  return NextResponse.next()
}
