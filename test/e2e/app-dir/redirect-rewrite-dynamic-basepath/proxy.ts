import { NextRequest, NextResponse } from 'next/server'

// Reproduces https://github.com/amannn/nextjs-16-3-bug-repro-basepath
// (the basePath variant of ../redirect-rewrite-dynamic).
//
// A plain proxy (formerly "middleware"):
//   /a -> redirect to /
//   /  -> rewrite to /a   (so `/` is served by the dynamic `/a` page)
//
// `request.nextUrl` is relative to the configured `basePath`, and the
// `basePath` is added back when the URL is serialized, so the redirect
// destination is `/base/path`.
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/a') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/a'
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  // Matcher sources are prefixed with the basePath (getMiddlewareMatchers),
  // so `/((?!_next|favicon.ico).*)` compiles to `/base/path/(...)` and does
  // not match a request to `/base/path` itself. `/` is listed explicitly so
  // the proxy still runs for the basePath root.
  matcher: ['/', '/((?!_next|favicon.ico).*)'],
}
