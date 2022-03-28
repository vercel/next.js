import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.headers.set('x-optional-catch-all-path', 'true')
  return response
}
