import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.headers.set('x-slug-id-path', 'true')
  return response
}
