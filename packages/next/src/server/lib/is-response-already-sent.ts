import type { ServerResponse } from 'node:http'

/**
 * Whether a response has already been handled and must not be routed further.
 *
 * `res.finished` alone is not enough. The `compression` middleware ends its own
 * stream from its `res.end()` wrapper, so on a compressed response the real
 * `end()` is deferred into the zlib stream and `res.finished` is still `false`
 * once the handler returns -- even though the status line and headers are
 * already on the wire.
 *
 * Routing such a response continues to the 404 fallthrough, which assigns
 * `res.statusCode = 404`. The wire status is unaffected, but the property is
 * not: anything reading it on `'finish'` (instrumentation, access logs) then
 * records a 404 for a response the client received as a 500.
 *
 * `finished` is what `resolveRoutes` reported. Neither half works alone:
 * `finished` is `true` for an ordinary render too, before a byte is written, and
 * `res.headersSent` is `true` throughout a streaming render that is still
 * legitimately in progress. Returning early on either would hang the request, so
 * it takes both -- reported handled, and already committed.
 */
export function isResponseAlreadySent(
  res: ServerResponse,
  finished: boolean | undefined
): boolean {
  return res.closed || res.finished || (Boolean(finished) && res.headersSent)
}
