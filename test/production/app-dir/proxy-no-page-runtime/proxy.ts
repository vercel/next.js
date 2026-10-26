import { NextResponse } from 'next/server'

export function proxy() {
  const response = NextResponse.next()
  response.headers.set('x-from-proxy', '1')
  return response
}
