import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.has('proxy-upgrade')) {
    return NextResponse.upgrade({})
  }

  const response = NextResponse.next()
  response.headers.set('x-proxy-result', 'continued')
  return response
}

export const config = {
  matcher: ['/ws', '/socket'],
}
