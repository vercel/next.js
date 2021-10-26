import { NextResponse } from 'next/server'

export async function middleware(request, _event) {
  const next = NextResponse.next()
  next.headers.set('x-deep-header', 'valid')
  next.headers.append('x-append-me', 'deep')
  next.headers.append('set-cookie', 'oatmeal')
  return next
}
