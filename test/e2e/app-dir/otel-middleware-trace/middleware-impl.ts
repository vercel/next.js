import { NextResponse, type NextRequest } from 'next/server'
import { getActiveTraceId, getOpenRootSpanTraceIds } from './trace-recorder'

// Shared by `proxy.ts` (Node.js runtime) and `middleware.ts` (Edge runtime).
export async function handler(request: NextRequest) {
  // The middleware's trace, for the test to collect the request's spans.
  const traceId = getActiveTraceId()
  const { pathname } = request.nextUrl

  let response: NextResponse
  if (pathname === '/rewrite') {
    response = NextResponse.rewrite(new URL('/page', request.url))
  } else if (pathname === '/rewrite-external') {
    response = NextResponse.rewrite('https://example.vercel.sh')
  } else if (pathname === '/rewrite-static') {
    response = NextResponse.rewrite(new URL('/static', request.url))
  } else if (pathname === '/rewrite-isr') {
    response = NextResponse.rewrite(new URL('/isr', request.url))
  } else if (pathname === '/redirect') {
    response = NextResponse.redirect(new URL('/page', request.url))
  } else if (pathname === '/direct') {
    response = new NextResponse('direct response from middleware')
  } else if (pathname === '/user-overrides') {
    const headers = new Headers(request.headers)
    headers.set('x-user-added', 'added-by-middleware')
    headers.delete('x-delete-me')
    response = NextResponse.rewrite(new URL('/headers-echo', request.url), {
      request: { headers },
    })
  } else if (pathname === '/user-traceparent') {
    // The test chooses the traceparent the middleware sets (a new one per
    // request).
    const headers = new Headers(request.headers)
    headers.set('traceparent', request.headers.get('x-test-traceparent')!)
    headers.delete('x-test-traceparent')
    response = NextResponse.rewrite(new URL('/headers-echo', request.url), {
      request: { headers },
    })
  } else if (pathname === '/outgoing') {
    // An outgoing request of the middleware: the `tracestate` it carries.
    const echo = await fetch(new URL('/tracestate-echo', request.url), {
      cache: 'no-store',
    })
    const { tracestate } = await echo.json()
    response = NextResponse.next()
    response.headers.set('x-mw-outgoing-tracestate', JSON.stringify(tracestate))
  } else if (pathname === '/root-state') {
    // The root spans the SDK keeps open in this process, apart from this
    // request's.
    response = NextResponse.json({
      open: getOpenRootSpanTraceIds()?.filter((id) => id !== traceId),
    })
  } else {
    response = NextResponse.next()
  }

  if (traceId) {
    response.headers.set('x-mw-trace-id', traceId)
  }
  return response
}
