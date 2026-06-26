import { NextResponse } from 'next/server'

export function proxy(request, context) {
  const url = new URL(request.url)
  url.pathname = `/en-EN${url.pathname}`

  return NextResponse.rewrite(url)
}

export const config = {
  // Matcher ignoring `/_next/`, `/api/`, static assets, favicon, etc.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
