import { NextResponse } from 'next/server'

export function proxy() {
  const response = NextResponse.next()
  response.headers.set('x-proxy', 'yes')
  return response
}

export const config = {
  matcher: ['/((?!_next/).*)'],
}
