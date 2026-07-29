import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  if (request.nextUrl.pathname === '/with-cookie') {
    response.cookies.set('token', 'secret-user-token')
  }
  return response
}

export const config = {
  matcher: ['/with-cookie', '/no-cookie'],
}
