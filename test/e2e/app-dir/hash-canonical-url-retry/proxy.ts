import { NextRequest, NextResponse } from 'next/server'

// Reproduces https://github.com/vercel/next.js/issues/95195
//
// A plain proxy (formerly "middleware"):
//   /a -> redirect to /
//   /  -> rewrite to /a   (so `/` is served by the dynamic `/a` page)
//
// i.e. the redirect target (`/`) is rewritten to a dynamic, param-reading page.
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/a') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/a', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/((?!_next|favicon.ico).*)',
}
