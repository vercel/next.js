import { type NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === '/request-insights-asset.svg' &&
    request.nextUrl.searchParams.has('rewrite-to-page')
  ) {
    return NextResponse.rewrite(new URL('/behind-proxy', request.url))
  }

  if (request.nextUrl.pathname === '/proxy-causal') {
    return fetch(new URL('/api/proxy-causal/proxy', request.nextUrl.origin), {
      cache: 'no-store',
    }).then(async (response) => {
      const payload = (await response.json()) as {
        causalCookieVisible: boolean
      }
      if (payload.causalCookieVisible) {
        throw new Error('The Request Insights causal cookie reached userland')
      }

      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-proxy-causal-origin', request.nextUrl.origin)
      requestHeaders.set('x-proxy-causal-status', String(response.status))
      return NextResponse.next({ request: { headers: requestHeaders } })
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/proxy-causal', '/request-insights-asset.svg'],
}
