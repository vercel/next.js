import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-from-middleware', '1')
  return NextResponse.next({ request: { headers } })
}

export const config = {
  runtime: 'nodejs',
  matcher: '/api/echo',
}
