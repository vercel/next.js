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
      : { traceparent: receivedTraceparent, tracestate: undefined }
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
 * `traceparent` and `tracestate` are forwarded as a pair: the downstream
 * request never carries one trace context's `traceparent` with another's
 * `tracestate`. Request-header overrides replace the whole downstream request
 * header set, so:
 * - Without user overrides (or with an empty list, which hosts ignore):
 *   nothing is added when the request already carries that trace context.
 *   Otherwise every request header the middleware received is listed
 *   (unchanged) alongside the trace context, except a received `tracestate`
 *   when the trace context has none.
 * - With user overrides, they are kept and the trace context headers are
 *   added. A `traceparent` the user explicitly set (to a value other than the
 *   one the middleware received) wins, together with whatever `tracestate`
 *   the user set (if any). Otherwise (`traceparent` copied unchanged from the
 *   request, e.g. via `new Headers(request.headers)`, or omitted) both are set
 *   to the trace context, dropping a user `tracestate` when it has none.
 *
 * Returns whether the downstream request carries `traceContext`.
 */
export function forwardTraceContextToRequest(
  responseHeaders: Headers,
  requestHeaders: Headers,
  traceContext: TraceContextHeaders | undefined
): boolean {
  if (!traceContext) {
    return false
  }

  // Redirects and direct responses have no downstream request.
  if (
    !responseHeaders.has('x-middleware-next') &&
    !responseHeaders.has('x-middleware-rewrite')
  ) {
    return false
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
      return true
    }

    const keys: string[] = []
    for (const [key, value] of requestHeaders) {
      if (!isTraceHeader(key)) {
        responseHeaders.set(REQUEST_HEADER_PREFIX + key, value)
        keys.push(key)
      }
    }
    setTraceContextOverrides(responseHeaders, keys, traceContext)
    return true
  }

  const keys = userOverrides
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
  if (
    keys.includes('traceparent') &&
    responseHeaders.get(REQUEST_HEADER_PREFIX + 'traceparent') !==
      requestHeaders.get('traceparent')
  ) {
    // The user explicitly set the `traceparent`: keep both trace headers as
    // the user set them.
    return false
  }
  setTraceContextOverrides(
    responseHeaders,
    keys.filter((key) => !isTraceHeader(key)),
    traceContext
  )
  return true
}

/**
 * Whether the middleware's response continues to the app (as opposed to a
 * redirect, a direct response, or a rewrite to another origin):
 * `NextResponse.next()`, or a rewrite to the origin of `requestURL`.
 */
export function continuesToSameOrigin(
  responseHeaders: Headers,
  requestURL: URL
): boolean {
  const rewrite = responseHeaders.get('x-middleware-rewrite')
  if (rewrite === null) {
    return responseHeaders.has('x-middleware-next')
  }
  try {
    return new URL(rewrite, requestURL).origin === requestURL.origin
  } catch {
    return false
  }
}

function isTraceHeader(key: string) {
  return key === 'traceparent' || key === 'tracestate'
}

// Lists the trace context's `traceparent` and `tracestate` (or no
// `tracestate`, if it has none) as request-header overrides, after `keys`
// (the other overridden headers).
function setTraceContextOverrides(
  responseHeaders: Headers,
  keys: string[],
  traceContext: TraceContextHeaders
) {
  responseHeaders.set(
    REQUEST_HEADER_PREFIX + 'traceparent',
    traceContext.traceparent
  )
  keys.push('traceparent')
  if (traceContext.tracestate) {
    responseHeaders.set(
      REQUEST_HEADER_PREFIX + 'tracestate',
      traceContext.tracestate
    )
    keys.push('tracestate')
  } else {
    responseHeaders.delete(REQUEST_HEADER_PREFIX + 'tracestate')
  }
  responseHeaders.set(OVERRIDE_HEADERS, keys.join(','))
}
