/**
 * Given a URL as a string and a base URL it will make the URL relative
 * if the parsed protocol and host is the same as the one in the base
 * URL. Otherwise it returns the same URL string.
 */
export function relativizeURL(url: string | URL, base: string | URL) {
  const baseURL = typeof base === 'string' ? new URL(base) : base
  const relativeURL = new URL(url, base)
  const relative = relativeURL.toString()

  // If the origin matches the baseURL origin then strip the origin off of the
  // url.
  if (relativeURL.origin === baseURL.origin) {
    return relative.slice(relativeURL.origin.length)
  }

  return relative
}
