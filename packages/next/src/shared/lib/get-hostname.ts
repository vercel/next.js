import type { OutgoingHttpHeaders } from 'http'

/**
 * Takes an object with a hostname property (like a parsed URL) and some
 * headers that may contain Host and returns the preferred hostname.
 * @param parsed An object containing a hostname property.
 * @param headers A dictionary with headers containing a `host`.
 */
export function getHostname(
  parsed: { hostname?: string | null },
  headers?: OutgoingHttpHeaders
): string | undefined {
  // Get the hostname from the headers if it exists, otherwise use the parsed
  // hostname.
  let hostname: string
  if (headers?.host && !Array.isArray(headers.host)) {
    const host = headers.host.toString()
    // An IPv6 address in a `Host` header is wrapped in brackets and may be
    // followed by a port, e.g. `[::1]:3000` (RFC 3986 §3.2.2). Splitting on the
    // first colon would mangle it to `[`, so keep the bracketed address, which
    // matches what `URL.prototype.hostname` returns for the same host.
    if (host.startsWith('[')) {
      const end = host.indexOf(']')
      hostname = end === -1 ? host : host.slice(0, end + 1)
    } else {
      hostname = host.split(':', 1)[0]
    }
  } else if (parsed.hostname) {
    hostname = parsed.hostname
  } else return

  return hostname.toLowerCase()
}
