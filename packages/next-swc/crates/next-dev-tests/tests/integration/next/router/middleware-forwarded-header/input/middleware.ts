import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const headers = request.headers
  return NextResponse.json({
    host: headers.get('x-forwarded-host'),
    ip: headers.get('x-forwarded-ip'),
    port: headers.get('x-forwarded-port'),
    proto: headers.get('x-forwarded-proto'),
  })
}

export const config = {
  matcher: '/headers',
}
