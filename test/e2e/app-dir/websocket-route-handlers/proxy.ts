import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.has('reject-if-proxy-runs')) {
    return new Response('malformed upgrade reached proxy', { status: 418 })
  }
  if (request.nextUrl.searchParams.has('proxy-upgrade')) {
    return NextResponse.upgrade({})
  }

  if (request.nextUrl.pathname.startsWith('/socket/')) {
    const destination = request.nextUrl.clone()
    destination.pathname = request.nextUrl.pathname.replace(
      '/socket/',
      '/rooms/'
    )
    destination.searchParams.set('from', 'proxy')
    return NextResponse.rewrite(destination)
  }

  const requestHeaders = new Headers(request.headers)
  if (request.nextUrl.searchParams.has('strip-origin-in-proxy')) {
    requestHeaders.delete('origin')
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-proxy-result', 'continued')
  response.cookies.set('proxy-cookie', 'present')
  return response
}

export const config = { matcher: ['/ws', '/socket/:path*'] }
