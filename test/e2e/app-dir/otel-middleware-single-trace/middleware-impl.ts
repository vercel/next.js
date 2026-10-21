import { trace } from '@opentelemetry/api'
import { NextResponse, type NextRequest } from 'next/server'
import { getParentSpanId, getSpanType } from './trace-recorder'

export const USER_TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
export const USER_SPAN_ID = 'b7ad6b7169203331'

// Shared by `proxy.ts` (Node.js runtime) and `middleware.ts` (Edge runtime).
export function handler(request: NextRequest) {
  const spanContext = trace.getActiveSpan()?.spanContext()
  const traceId = spanContext?.traceId ?? 'none'
  const spanId = spanContext?.spanId ?? 'none'
  // The middleware span's parent: a span started in this process (next-server's
  // middleware-invoke `handleRequest`, or the root span inserted by the
  // middleware adapter) or the remote parent from the request's `traceparent`.
  const parentSpanId = getParentSpanId(spanContext?.spanId)
  const parentType = getSpanType(parentSpanId) ?? 'remote'
  const grandparentSpanId = getParentSpanId(parentSpanId)
  const receivedTraceparent = request.headers.get('traceparent') ?? 'none'
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

  response.headers.set('x-mw-trace-id', traceId)
  response.headers.set('x-mw-span-id', spanId)
  response.headers.set('x-mw-parent-span-id', parentSpanId ?? 'none')
  response.headers.set('x-mw-parent-type', parentType)
  response.headers.set('x-mw-grandparent-span-id', grandparentSpanId ?? 'none')
  response.headers.set('x-mw-received-traceparent', receivedTraceparent)
  return response
}
