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
  if (request.nextUrl.searchParams.has('direct')) {
    return new NextResponse('direct response from middleware')
  }
  if (request.nextUrl.searchParams.has('redirect')) {
    return NextResponse.redirect(new URL('/behind-middleware', request.url))
  }
  return NextResponse.next()
}
