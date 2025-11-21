import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import type { Headers as NodeFetchHeaders } from 'node-fetch'

const KEY = 'x-request-meta'

/**
 * Adds a new header to the headers object and serializes it. To be used in
 * conjunction with the `getRequestMeta` function in tests to verify request
 * data from the handler.
 *
 * @param meta metadata to inject into the headers
 * @param headers the existing headers on the response to merge with
 * @returns the merged headers with the request meta added
 */
export function withRequestMeta(
  meta: Record<string, any>,
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    ...headers,
    [KEY]: JSON.stringify(meta),
  }
}

/**
 * Adds a cookie to the headers with the provided request metadata. Existing
 * cookies will be merged, but it will not merge request metadata that already
 * exists on an existing cookie.
 *
 * @param meta metadata to inject into the headers via a cookie
 * @param headers the existing headers on the response to merge with
 * @returns the merged headers with the request meta added as a cookie
 */
export function cookieWithRequestMeta(
  meta: Record<string, any>,
  { cookie = '', ...headers }: Record<string, string> = {}
): Record<string, string> {
  if (cookie) cookie += '; '

  // We encode this with `btoa` because the JSON string can contain characters
  // that are invalid in a cookie value.
  cookie += `${KEY}=${btoa(JSON.stringify(meta))}`

  return {
    ...headers,
    cookie,
  }
}

type Cookies = {
  get(name: string): { name: string; value: string } | undefined
}

/**
 * Gets request metadata from the response headers or cookie.
 *
 * @param headersOrCookies response headers from the request or cookies object
 * @returns any injected metadata on the request
 */
export function getRequestMeta(
  headersOrCookies:
    | Headers
    | Cookies
    | ReadonlyHeaders
    | ReadonlyRequestCookies
    | NodeFetchHeaders
): Record<string, any> {
  const headerOrCookie = headersOrCookies.get(KEY)
  if (!headerOrCookie) return {}

  // If the value is a string, then parse it now, it was headers.
  if (typeof headerOrCookie === 'string') return JSON.parse(headerOrCookie)

  // It's a cookie! Parse it now. The cookie value should be encoded with
  // `btoa`, hence the use of `atob`.
  return JSON.parse(atob(headerOrCookie.value))
}
