import type { IncomingHttpHeaders } from 'http'

/**
 * Set by `createForwardedActionResponse` on a Server Action request that it has
 * forwarded to a different worker, so the receiving worker knows the request has
 * already been forwarded once.
 */
export const ACTION_FORWARDED_HEADER = 'x-action-forwarded'

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
 * A Server Action POST that lands on a route which doesn't bundle the action is
 * forwarded to a worker that does, by fetching our own internal origin (see
 * `createForwardedActionResponse`). `host` is a forbidden `fetch` header, so it
 * can't be carried over, and the subrequest arrives claiming to be for the
 * internal origin instead of the host the user actually requested.
 *
 * `x-forwarded-host` does survive the forward, so restore `host` from it.
 * Otherwise `headers().get('host')` inside a forwarded action reports
 * `localhost:PORT`, which silently breaks host-based multi-tenancy for exactly
 * those actions that happen to get forwarded.
 */
export function restoreForwardedActionHost(headers: IncomingHttpHeaders): void {
  if (!headers[ACTION_FORWARDED_HEADER]) {
    return
  }

  // Only rewrite a request that really did arrive over the internal forward.
  // When the origin isn't set, `createForwardedActionResponse` falls back to the
  // initial request URL, which already carries the original host.
  const internalOrigin = process.env.__NEXT_PRIVATE_ORIGIN
  if (!internalOrigin) {
    return
  }

  let internalHost: string
  try {
    internalHost = new URL(internalOrigin).host
  } catch {
    return
  }

  if (headers['host'] !== internalHost) {
    return
  }

  const forwardedHost = getForwardedHostValue(headers)
  if (forwardedHost) {
    headers['host'] = forwardedHost
  }
}
