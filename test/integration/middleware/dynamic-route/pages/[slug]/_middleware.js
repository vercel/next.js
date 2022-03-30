import { NextResponse } from 'next/server'

export function middleware(req) {
  const response = NextResponse.next()
  response.headers.set('x-slug-path', 'true')
  return response
}
