import type { NextRequest, NextFetchEvent } from 'next/server'
import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/behind-middleware', '/behind-middleware/:path*'],
  runtime: 'nodejs',
}

export async function middleware(
  request: NextRequest,
  event?: NextFetchEvent
): Promise<Response> {
  return NextResponse.next()
}
