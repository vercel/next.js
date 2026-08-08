import type { IncomingHttpHeaders } from 'http'
import type { BaseNextRequest } from '../base-http'
import { getRequestMeta } from '../request-meta'
import { getServerActionRequestMetadata } from '../lib/server-action-request-meta'
import { InvariantError } from '../../shared/lib/invariant-error'
import { RSC_HEADER } from '../../client/components/app-router-headers'
import { isRSCRequestHeader } from '../lib/is-rsc-request'

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
 * Set by `createRedirectRenderResult` on the internal RSC request used to
 * stream an app-relative Server Action redirect.
 */
export const ACTION_REDIRECT_FORWARDED_HEADER = 'x-action-redirect-forwarded'

export const ACTION_REDIRECT_FORWARDED_VALUE = '1'

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
 * `restoreActionForwardingHost` uses it to recognize a request that arrived over
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
 * The internal self-fetches used to forward a Server Action to another worker
 * and to stream an app-relative action redirect both derive `host` from the
 * forwarding origin. The subrequest therefore arrives claiming to be for that
 * internal origin instead of the host the user actually requested.
 *
 * `x-forwarded-host` does survive the forward, so restore `host` from it.
 * Otherwise `headers().get('host')` inside a forwarded action or its streamed
 * redirect target reports `localhost:PORT`, which silently breaks host-based
 * multi-tenancy.
 *
 * Neither internal marker is authenticated, so they are treated as hints rather
 * than proof: the rewrite additionally requires the request shape produced by
 * its send path and arrival at the origin we would have forwarded to.
 */
export function restoreActionForwardingHost(
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
  const isForwardedAction =
    req.headers[ACTION_FORWARDED_HEADER] === ACTION_FORWARDED_VALUE &&
    getServerActionRequestMetadata(req).isFetchAction

  const isForwardedActionRedirect =
    req.headers[ACTION_REDIRECT_FORWARDED_HEADER] ===
      ACTION_REDIRECT_FORWARDED_VALUE &&
    req.method === 'GET' &&
    isRSCRequestHeader(req.headers[RSC_HEADER])

  // The markers are forgeable, so only the exact values and request shapes the
  // two send paths produce count. Repeated markers are comma-joined and fail.
  if (!isForwardedAction && !isForwardedActionRedirect) {
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
