import { NextResponse } from 'next/server'

export async function middleware(request, _event) {
  const next = NextResponse.next()
  next.headers.set('x-deep-header', 'valid')
  if (request.nextUrl.searchParams.get('append-me') === 'true') {
    next.headers.append('x-append-me', 'deep')
  }
  if (request.nextUrl.searchParams.get('cookie-me') === 'true') {
    next.headers.append('set-cookie', 'oatmeal')
  }
  return next
}
