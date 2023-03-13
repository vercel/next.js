/**
 * Takes an object with a hostname property (like a parsed URL) and some
 * headers that may contain Host and returns the preferred hostname.
 * @param parsed An object containing a hostname property.
 * @param headers A dictionary with headers containing a `host`.
 */
export function getHostname(
  parsed: { hostname?: string | null },
  headers?: { [key: string]: string | string[] | undefined }
) {
  return ((!Array.isArray(headers?.host) && headers?.host) || parsed.hostname)
    ?.split(':')[0]
    .toLowerCase()
}
