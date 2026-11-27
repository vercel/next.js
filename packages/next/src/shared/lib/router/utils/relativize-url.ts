/**
 * The result of parsing a URL relative to a base URL.
 */
export type RelativeURL = {
  /**
   * The relative URL. Either a URL including the origin or a relative URL.
   */
  url: string

  /**
   * Whether the URL is relative to the base URL.
   */
  isRelative: boolean
}

// Mirrors REGEX_LOCALHOST_HOSTNAME in server/web/next-url.ts, which rewrites
// loopback hosts to `localhost`. The router builds its base URL from the bind
// address (e.g. 127.0.0.1), so the two spellings must compare as the same
// origin or an internal rewrite would be turned into an external proxy request.
const REGEX_LOCALHOST_HOSTNAME =
  /^(?:127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}|\[::1\]|localhost)$/

function getComparableOrigin(url: URL): string {
  if (REGEX_LOCALHOST_HOSTNAME.test(url.hostname)) {
    const normalized = new URL(url.href)
    normalized.hostname = 'localhost'
    return normalized.origin
  }
  return url.origin
}

export function parseRelativeURL(
  url: string | URL,
  base: string | URL
): RelativeURL {
  const baseURL = typeof base === 'string' ? new URL(base) : base
  const relative = new URL(url, base)

  // The URL is relative if the origin is the same as the base URL. Loopback
  // spellings (127.0.0.1, [::1], localhost) are treated as equivalent.
  const isRelative =
    getComparableOrigin(relative) === getComparableOrigin(baseURL)

  return {
    url: isRelative
      ? // Slice by the resolved URL's own origin: it is always the prefix of
        // its string form, even when the base used a different spelling.
        relative.toString().slice(relative.origin.length)
      : relative.toString(),
    isRelative,
  }
}

/**
 * Given a URL as a string and a base URL it will make the URL relative
 * if the parsed protocol and host is the same as the one in the base
 * URL. Otherwise it returns the same URL string.
 */
export function getRelativeURL(url: string | URL, base: string | URL): string {
  const relative = parseRelativeURL(url, base)
  return relative.url
}
