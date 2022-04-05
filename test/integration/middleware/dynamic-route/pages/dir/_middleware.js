import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.headers.set('x-dir-path', 'true')
  return response
}
