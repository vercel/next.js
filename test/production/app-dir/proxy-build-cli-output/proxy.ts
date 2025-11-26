import { NextRequest, NextResponse } from 'next/server'

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/foo') {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.next()
}
