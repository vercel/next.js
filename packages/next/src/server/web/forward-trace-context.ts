import type { TraceContextHeaders } from '../lib/trace/tracer'

const OVERRIDE_HEADERS = 'x-middleware-override-headers'
const REQUEST_HEADER_PREFIX = 'x-middleware-request-'

/**
 * Forwards the middleware's W3C trace context to the downstream request by
 * adding `traceparent` / `tracestate` request-header overrides to a middleware
 * response that continues the request (`NextResponse.next()` or a rewrite).
 *
 * Hosts that invoke middleware separately from the render (deployments,
 * adapters, direct entrypoints) already apply these overrides to the
 * downstream request, so the render joins the middleware's trace instead of
 * starting a new one.
 *
 * Request-header overrides replace the whole downstream request header set,
 * so:
 * - Without user overrides (or with an empty list, which hosts ignore), every
 *   request header the middleware received is listed (unchanged) alongside
 *   the trace context.
 * - With user overrides, they are kept and only the trace context headers are
 *   appended. Trace context headers the user set explicitly win.
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

  const traceHeaders = Object.entries(traceContext).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )

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
      continue
    }
    responseHeaders.set(REQUEST_HEADER_PREFIX + key, value)
    keys.push(key)
  }
  responseHeaders.set(OVERRIDE_HEADERS, keys.join(','))
}
