import type { TraceContextHeaders } from '../lib/trace/tracer'

const OVERRIDE_HEADERS = 'x-middleware-override-headers'
const REQUEST_HEADER_PREFIX = 'x-middleware-request-'

/**
 * Forwards the middleware's W3C trace context to the downstream request by
 * adding `traceparent` / `tracestate` request-header overrides to a middleware
 * response that continues the request (`NextResponse.next()` or a rewrite).
 *
 * Every host applies these overrides to the downstream request: hosts that
 * invoke middleware separately from the render (deployments, adapters, direct
 * entrypoints) as well as next-server's router server. Forwarding the
 * middleware span's context therefore nests the render inside the middleware
 * span instead of starting a new trace.
 *
 * Request-header overrides replace the whole downstream request header set,
 * so:
 * - Without user overrides (or with an empty list, which hosts ignore), every
 *   request header the middleware received is listed (unchanged) alongside
 *   the trace context.
 * - With user overrides, they are kept and only the trace context headers are
 *   added. A trace context header the user explicitly set (to a value other
 *   than the one the middleware received) wins. One copied unchanged from the
 *   request (e.g. via `new Headers(request.headers)`) is replaced, as it is no
 *   explicit choice.
 */
export function forwardTraceContextToRequest(
  responseHeaders: Headers,
  requestHeaders: Headers,
  traceContext: TraceContextHeaders | undefined
): void {
  if (!traceContext) {
    return
  }

  // Redirects and direct responses have no downstream request.
  if (
    !responseHeaders.has('x-middleware-next') &&
    !responseHeaders.has('x-middleware-rewrite')
  ) {
    return
  }

  const traceHeaders: Array<[string, string]> = [
    ['traceparent', traceContext.traceparent],
  ]
  if (traceContext.tracestate) {
    traceHeaders.push(['tracestate', traceContext.tracestate])
  }

  const userOverrides = responseHeaders.get(OVERRIDE_HEADERS)
  // An empty override list is ignored by hosts (no headers are replaced), so
  // treat it like no overrides rather than turning it into "only the trace
  // context headers".
  if (!userOverrides) {
    const keys: string[] = []
    for (const [key, value] of requestHeaders) {
      responseHeaders.set(REQUEST_HEADER_PREFIX + key, value)
      keys.push(key)
    }
    for (const [key, value] of traceHeaders) {
      responseHeaders.set(REQUEST_HEADER_PREFIX + key, value)
      if (!keys.includes(key)) {
        keys.push(key)
      }
    }
    responseHeaders.set(OVERRIDE_HEADERS, keys.join(','))
    return
  }

  const keys = userOverrides
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
  for (const [key, value] of traceHeaders) {
    if (keys.includes(key)) {
      if (
        responseHeaders.get(REQUEST_HEADER_PREFIX + key) !==
        requestHeaders.get(key)
      ) {
        continue
      }
    } else {
      keys.push(key)
    }
    responseHeaders.set(REQUEST_HEADER_PREFIX + key, value)
  }
  responseHeaders.set(OVERRIDE_HEADERS, keys.join(','))
}
