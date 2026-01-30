import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl

  // Test: Add a header to all requests
  const response = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers),
        'x-middleware-test': 'hello-from-middleware',
      }),
    },
  })

  // Test: Redirect /ws-redirect to /ws
  if (url.pathname === '/ws-redirect') {
    return NextResponse.redirect(new URL('/ws', request.url))
  }

  // Test: Rewrite /ws-rewrite to /ws
  if (url.pathname === '/ws-rewrite') {
    return NextResponse.rewrite(new URL('/ws', request.url))
  }

  // Test: Block /ws-blocked
  if (url.pathname === '/ws-blocked') {
    return new NextResponse('Blocked by middleware', { status: 403 })
  }

  return response
}

export const config = {
  matcher: ['/ws', '/ws-redirect', '/ws-rewrite', '/ws-blocked'],
}
