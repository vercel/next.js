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
  headers: HeadersInit = {}
): HeadersInit {
  return {
    ...headers,
    [KEY]: JSON.stringify(meta),
  }
}

/**
 * Gets request metadata from the response headers.
 *
 * @param headers response headers from the request
 * @returns any injected metadata on the request
 */
export function getRequestMeta(headers: Headers): Record<string, any> {
  const header = headers.get(KEY)
  if (!header) return {}

  return JSON.parse(header)
}
