import { NextResponse, type NextRequest } from 'next/server'
import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import * as variants from './variants'

// The variants transform will wrap the proxy automatically, and synthesize one
// when the project has none. Wired by hand until then.
export const proxy = wrapProxy(variants, (request: NextRequest) => {
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
  matcher: ['/', '/rewrite-source', '/external', '/enumerated/:slug'],
}
