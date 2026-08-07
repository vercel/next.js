import type { IncomingHttpHeaders } from 'http'
import type { BaseNextRequest } from '../base-http'
import { getRequestMeta } from '../request-meta'
import { getServerActionRequestMetadata } from '../lib/server-action-request-meta'
import { InvariantError } from '../../shared/lib/invariant-error'

/**
 * Set by `createForwardedActionResponse` on a Server Action request that it has
 * forwarded to a different worker, so the receiving worker knows the request has
 * already been forwarded once.
 */
export const ACTION_FORWARDED_HEADER = 'x-action-forwarded'

/**
 * The only value `createForwardedActionResponse` ever sends. The header is not
 * in `INTERNAL_HEADERS` (it can't be — the same ingress filter runs on the
 * loopback request and would strip the genuine marker), so an external client
 * can send it too. Matching the value exactly keeps the checks below narrow.
 */
export const ACTION_FORWARDED_VALUE = '1'

/**
 * Reads the first value of `x-forwarded-host`, which can arrive either as a
 * repeated header or as a single comma-separated list.
 */
export function getForwardedHostValue(
  headers: IncomingHttpHeaders
): string | undefined {
  const forwardedHostHeader = headers['x-forwarded-host']

  return Array.isArray(forwardedHostHeader)
    ? forwardedHostHeader[0]
    : forwardedHostHeader?.split(',')?.[0]?.trim()
}

/**
 * The origin Next.js fetches when it forwards a request to itself: action
 * forwarding (`createForwardedActionResponse`) and app-relative redirect
 * streaming (`createRedirectRenderResult`) both go here, and
 * `restoreForwardedActionHost` uses it to recognize a request that arrived over
 * such a forward. The send and receive sides have to agree, so they share this.
 *
 * Throws when no origin can be determined, which is a hard error on the send
 * side — there is nowhere to forward to.
 */
export function getActionForwardingOrigin(req: BaseNextRequest): string {
  // TODO: Remove __NEXT_PRIVATE_ORIGIN
  const privateOrigin = process.env.__NEXT_PRIVATE_ORIGIN
  if (privateOrigin !== undefined) {
    return privateOrigin
  }

  const initURL = getRequestMeta(req, 'initURL')
  if (initURL === undefined) {
    throw new InvariantError('Missing initURL')
  }

  try {
    return new URL(initURL).origin
  } catch (error) {
    throw new Error(
      'Could not determine origin for forwarded Server Actions request. This can happen if port or hostname are not configured for this server.',
      { cause: error }
    )
  }
}

/**
 * A Server Action POST that lands on a route which doesn't bundle the action is
 * forwarded to a worker that does, by fetching our own forwarding origin (see
 * `createForwardedActionResponse`). `host` is a forbidden `fetch` header, so it
 * can't be carried over, and the subrequest arrives claiming to be for that
 * internal origin instead of the host the user actually requested.
 *
 * `x-forwarded-host` does survive the forward, so restore `host` from it.
 * Otherwise `headers().get('host')` inside a forwarded action reports
 * `localhost:PORT`, which silently breaks host-based multi-tenancy for exactly
 * those actions that happen to get forwarded.
 *
 * `x-action-forwarded` is not an authenticated marker, so it is treated as a
 * hint rather than as proof: the rewrite additionally requires the request to
 * be a fetch action (the only shape that is ever forwarded) that arrived at the
 * origin we would have forwarded to.
 */
export function restoreForwardedActionHost(
  req: BaseNextRequest,
  {
    hasConfiguredOrigin,
  }: {
    /**
     * Whether the server was started with an explicit hostname and port, and so
     * builds `initURL` from its own origin rather than from the incoming `host`
     * header. See `attachRequestMeta` in `next-server.ts`.
     */
    hasConfiguredOrigin: boolean
  }
): void {
  // Not a truthiness check: the header is forgeable, so only the exact value we
  // send counts. A repeated header arrives here comma-joined, which also fails.
  if (req.headers[ACTION_FORWARDED_HEADER] !== ACTION_FORWARDED_VALUE) {
    return
  }

  // `handleAction` only forwards when it has an action id on a POST, so no
  // other request shape can have reached us through the forwarding path.
  if (!getServerActionRequestMetadata(req).isFetchAction) {
    return
  }

  const forwardedHost = getForwardedHostValue(req.headers)
  if (!forwardedHost) {
    return
  }

  // Without a private origin the forwarding origin comes from `initURL`, which
  // is the server's own origin only when it was started with a hostname and
  // port. Otherwise `initURL` is built from this request's own `host` header,
  // which would make the origin comparison below vacuously true.
  if (process.env.__NEXT_PRIVATE_ORIGIN === undefined && !hasConfiguredOrigin) {
    return
  }

  let internalHost: string
  try {
    internalHost = new URL(getActionForwardingOrigin(req)).host
  } catch {
    // We can't tell where a forward would have gone, so don't rewrite anything.
    return
  }

  // The request has to have arrived at the origin we forward to.
  if (req.headers['host'] !== internalHost) {
    return
  }

  req.headers['host'] = forwardedHost
}
