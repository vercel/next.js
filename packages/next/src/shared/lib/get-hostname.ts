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
    // IPv6 literals carry colons inside the brackets, so cut after `]` instead of at the first `:`.
    const host = headers.host.toString()
    const bracketEnd = host.startsWith('[') ? host.indexOf(']') + 1 : -1
    hostname = bracketEnd > 0 ? host.slice(0, bracketEnd) : host.split(':', 1)[0]
  } else if (parsed.hostname) {
    hostname = parsed.hostname
  } else return

  return hostname.toLowerCase()
}
