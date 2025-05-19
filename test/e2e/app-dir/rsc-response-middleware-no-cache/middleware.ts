import { NextRequest, NextResponse } from 'next/server'

export default function middleware(request: NextRequest) {
  const url = request.nextUrl

  if (url.pathname === '/p2') {
    url.pathname = '/'
    return NextResponse.redirect(url, 307)
  }
}
