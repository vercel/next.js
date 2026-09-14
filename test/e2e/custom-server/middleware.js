import { NextResponse } from 'next/server'

export default function middleware(request) {
  const response = NextResponse.next()
  response.headers.append('x-original-url', request.url)
  return response
}

export const config = {
  matcher: '/middleware-augmented',
}
