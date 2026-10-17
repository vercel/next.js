import type { TraceContextHeaders } from '../lib/trace/tracer'

const OVERRIDE_HEADERS = 'x-middleware-override-headers'
const REQUEST_HEADER_PREFIX = 'x-middleware-request-'

// The trace ID and parent ID of a W3C `traceparent`
// (`version-traceid-parentid-flags`), lower-cased.
function getTraceparentIds(traceparent: string | null | undefined) {
  const [, traceId, parentId] = traceparent?.toLowerCase().split('-') ?? []
  return traceId && parentId ? `${traceId}-${parentId}` : undefined
}

/**
 * The trace context of the span that the middleware span and the downstream
 * request (the render) share as their parent, given the middleware's active
 * context (before the middleware span starts).
 *
 * When the active context is the one the request carries (an incoming
 * `traceparent`, or the one next-server's middleware-invoke pass wrote onto
 * the request), the received `traceparent` / `tracestate` are returned
 * verbatim, so the middleware never changes them. Otherwise (an active host
 * span, or a root span inserted by the middleware adapter) the active
 * context is returned.
 */
export function getSharedParentTraceContext(
  requestHeaders: Headers,
  activeTraceContext: TraceContextHeaders | undefined
): TraceContextHeaders | undefined {
  if (!activeTraceContext) {
    return undefined
  }

  const receivedTraceparent = requestHeaders.get('traceparent')
  const receivedIds = getTraceparentIds(receivedTraceparent)
  if (
    receivedTraceparent &&
    receivedIds &&
    receivedIds === getTraceparentIds(activeTraceContext.traceparent)
  ) {
    const receivedTracestate = requestHeaders.get('tracestate')
    return receivedTracestate
      ? { traceparent: receivedTraceparent, tracestate: receivedTracestate }
      : { traceparent: receivedTraceparent }
  }
  return activeTraceContext
}

/**
 * Makes sure the downstream request of a middleware response that continues
 * the request (`NextResponse.next()` or a rewrite) carries the trace context
 * of the middleware span's parent, so the render is a sibling of the
 * middleware span in the same trace. It is passed as `traceparent` /
 * `tracestate` request-header overrides, which every host applies to the
 * downstream request: hosts that invoke middleware separately from the render
 * (deployments, adapters, direct entrypoints) as well as next-server's router
 * server.
 *
 * Request-header overrides replace the whole downstream request header set,
 * so:
 * - Without user overrides (or with an empty list, which hosts ignore):
 *   nothing is added when the request already carries that trace context.
 *   Otherwise every request header the middleware received is listed
 *   (unchanged) alongside the trace context.
 * - With user overrides, they are kept and only the trace context headers are
 *   added. A trace context header the user explicitly set (to a value other
 *   than the one the middleware received) wins. One copied unchanged from the
 *   request (e.g. via `new Headers(request.headers)`) or omitted is set to the
 *   trace context.
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
    if (
      requestHeaders.get('traceparent') === traceContext.traceparent &&
      requestHeaders.get('tracestate') === (traceContext.tracestate ?? null)
    ) {
      // The downstream request already carries the trace context.
      return
    }

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
