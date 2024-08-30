import type { NextRequest, NextFetchEvent } from 'next/server'
import { NextResponse } from 'next/server'

export const config: {
  matcher: string[]
} = {
  matcher: ['/behind-middleware', '/behind-middleware/:path*'],
}

export async function middleware(
  request: NextRequest,
  event?: NextFetchEvent
): Promise<Response> {
  return NextResponse.next()
}
