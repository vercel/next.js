import { NextResponse, type NextRequest } from 'next/server'
import { getMiddlewareSpans } from './trace-recorder'

export const USER_TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
export const USER_SPAN_ID = 'b7ad6b7169203331'

// Shared by `proxy.ts` (Node.js runtime) and `middleware.ts` (Edge runtime).
export function handler(request: NextRequest) {
  // The middleware's span and its ancestors started in this process, for the
  // test to print the request's span tree.
  const spans = getMiddlewareSpans()
  const { pathname } = request.nextUrl

  let response: NextResponse
  if (pathname === '/rewrite') {
    response = NextResponse.rewrite(new URL('/page', request.url))
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
    const headers = new Headers(request.headers)
    headers.set('traceparent', `00-${USER_TRACE_ID}-${USER_SPAN_ID}-01`)
    response = NextResponse.rewrite(new URL('/headers-echo', request.url), {
      request: { headers },
    })
  } else {
    response = NextResponse.next()
  }

  response.headers.set('x-mw-spans', JSON.stringify(spans))
  return response
}
