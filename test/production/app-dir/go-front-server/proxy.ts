import { NextResponse } from 'next/server'
export function proxy() {
  const response = NextResponse.next()
  response.headers.set('x-node-proxy', 'yes')
  return response
}
