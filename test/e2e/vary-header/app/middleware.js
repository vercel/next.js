import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.headers.append('my-custom-header', 'test')
  response.headers.append('vary', 'my-custom-header')
  return response
}
