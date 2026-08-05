import { NextResponse, type NextRequest } from 'next/server'
import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { banner, locale, theme } from './variants'

// The variants transform will wrap the proxy automatically, synthesize one when
// the project has none, and derive each route's variants from its module graph,
// layouts included. Wired by hand until then.
//
// A route reads only some of the variants a project declares, and resolving the
// rest would send the origin values nothing consumes. `/rewrite-target` is
// listed rather than `/rewrite-source`, because the rewrite below decides which
// route renders.
const variantsByRoute = {
  '/': [banner, locale, theme],
  '/enumerated/[slug]': [locale, theme],
  '/on-demand/[slug]': [banner, theme],
  '/paramless': [locale, theme],
  '/rewrite-target': [banner, locale, theme],
  '/search-params': [theme],
  '/shell/[slug]': [banner, locale, theme],
}

export const proxy = wrapProxy(variantsByRoute, (request: NextRequest) => {
  const { pathname } = request.nextUrl

  if (pathname === '/rewrite-source') {
    return NextResponse.rewrite(new URL('/rewrite-target', request.url))
  }

  if (pathname === '/external') {
    const port = process.env.EXTERNAL_SERVER_PORT

    if (!port) {
      throw new Error(
        'The `EXTERNAL_SERVER_PORT` environment variable is not set. The test starts the external server and sets it before starting Next.js.'
      )
    }

    return NextResponse.rewrite(`http://localhost:${port}/external`)
  }
})

export const config = {
  matcher: [
    '/',
    '/rewrite-source',
    '/external',
    '/enumerated/:slug',
    '/shell/:slug',
    '/on-demand/:slug',
    '/paramless',
    '/search-params',
  ],
}
