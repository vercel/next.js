import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set('x-deferred-entries-middleware', 'true')
  response.headers.set(
    'x-deferred-entries-middleware-path',
    request.nextUrl.pathname
  )
  return response
}
