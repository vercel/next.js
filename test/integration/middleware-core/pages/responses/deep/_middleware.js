import { NextResponse } from 'next/server'

export async function middleware(request, _event) {
  const next = NextResponse.next()
  next.headers.set('x-deep-header', 'valid')
  if (request.nextUrl.searchParams.get('append-me') === 'true') {
    next.headers.append('x-append-me', 'deep')
  }
  return next
}
