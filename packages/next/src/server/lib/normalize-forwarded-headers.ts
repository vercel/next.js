/**
 * Extracts the protocol from the `x-forwarded-proto` header.
 *
 * When a request passes through multiple proxies/gateways, the
 * `x-forwarded-proto` header may contain multiple comma-separated values
 * (e.g. `"https, https"`) or the header may appear multiple times.
 * Per RFC 7239, the leftmost value is the one set by the first proxy
 * (closest to the client), so we always use that.
 *
 * Without this normalization, `new URL("https, https://host/path")` throws
 * or returns an invalid URL, causing middleware redirects to fall back to
 * `localhost:3000`.
 *
 * @see https://github.com/vercel/next.js/issues/54450
 */
export function getForwardedProto(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const value = headers['x-forwarded-proto']
  if (!value) return undefined

  // Handle array form (multiple headers with the same name)
  const raw = Array.isArray(value) ? value[0] : value

  // Take the first comma-separated value and trim whitespace
  return raw.split(',')[0].trim() || undefined
}

/**
 * Determines the request protocol from the forwarded headers or TLS state.
 *
 * @param headers - The incoming request headers.
 * @param encrypted - Whether the socket is TLS-encrypted.
 * @returns `'https'` or `'http'`.
 */
export function getForwardedProtocol(
  headers: Record<string, string | string[] | undefined>,
  encrypted?: boolean
): 'https' | 'http' {
  if (encrypted) return 'https'
  const proto = getForwardedProto(headers)
  return proto === 'https' ? 'https' : 'http'
}
