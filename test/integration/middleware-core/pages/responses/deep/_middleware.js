import { NextResponse } from 'next/server'

export async function middleware(request, _event) {
  const next = NextResponse.next()
  next.headers.set('x-deep-header', 'valid')
  if (request.nextUrl.searchParams.get('override-me') === 'true') {
    next.headers.set('x-override-me', 'deep')
  }
  return next
}
