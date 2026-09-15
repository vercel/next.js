import { NextResponse, type NextRequest } from 'next/server'
import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { country, locale, theme } from './variants'

// This table names the variants of each route by hand.
//
// TODO(variants): the variants transform wraps the proxy, synthesizes one for a
// project that has none, and derives each route's variants from its module
// graph, layouts included.
//
// A route reads only some of the variants that a project declares. Resolution
// of the rest would send the origin values that no code reads. The table lists
// `/rewrite-target` and not `/rewrite-source`, because the rewrite below decides
// which route renders.
const variantsByRoute = {
  '/': [locale, theme],
  '/rewrite-target': [locale, theme],
  // This route declares static combinations that assign `country`, so a request
  // to it resolves that variant as well, even though the route reads only the
  // other two.
  '/declared': [country, locale, theme],
  // The `config.matcher` below omits this route on purpose. See the route.
  '/unmatched-by-proxy': [locale, theme],
}

export const proxy = wrapProxy(variantsByRoute, (request: NextRequest) => {
  const { pathname } = request.nextUrl

  if (pathname === '/rewrite-source') {
    // Cloned rather than built from `request.url`, so that a configured base
    // path is kept: `nextUrl` holds the pathname without it and adds it back
    // when the URL is stringified.
    const target = request.nextUrl.clone()
    target.pathname = '/rewrite-target'

    return NextResponse.rewrite(target)
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
  matcher: ['/', '/declared', '/rewrite-source', '/external'],
}
