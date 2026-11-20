import { NextResponse, userAgent, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  return NextResponse.json(userAgent(request))
}

export const config = {
  matcher: '/proxy',
}
