import { NextRequest, NextResponse } from 'next/server'

export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
