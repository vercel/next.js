import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-body-probe', 'preserved')
  const options = request.nextUrl.searchParams.has('override')
    ? { request: { headers } }
    : undefined

  if (request.nextUrl.pathname === '/api/external') {
    return NextResponse.rewrite(process.env.TEST_PROXY_TARGET!, options)
  }
  return NextResponse.next(options)
}

export const config = {
  matcher: '/api/:path*',
}
