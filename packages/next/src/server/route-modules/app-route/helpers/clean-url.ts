/**
 * Cleans a URL by stripping the protocol, host, and search params.
 *
 * @param urlString the url to clean
 * @returns the cleaned url
 */

export function cleanURL(url: string | URL): URL {
  const u = new URL(url)
  u.host = 'localhost:3000'
  u.search = ''
  u.protocol = 'http'
  return u
}
