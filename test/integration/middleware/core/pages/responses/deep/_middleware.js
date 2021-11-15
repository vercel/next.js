import { NextResponse } from 'next/server'

export async function middleware(request, _event) {
  if (request.nextUrl.searchParams.get('deep-intercept') === 'true') {
    return new NextResponse('intercepted!')
  }
  const next = NextResponse.next()
  next.headers.set('x-deep-header', 'valid')
  next.headers.append('x-append-me', 'deep')
  next.headers.append('set-cookie', 'foo=oatmeal')
  return next
}
