import { NextResponse } from 'next/server'

export function proxy() {
  const response = NextResponse.next()
  response.headers.set('x-proxied', 'yes')
  return response
}

export const config = {
  matcher: ['/first-match'],
}
