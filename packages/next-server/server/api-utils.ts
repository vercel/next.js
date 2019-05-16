import { IncomingMessage, IncomingHttpHeaders } from 'http'
import { parse as parseCookie } from 'cookie'
import { parse } from 'url'

/**
 * Parse cookies from request header
 * @param cookie from headers
 */
export function parseCookies({ cookie }: IncomingHttpHeaders) {
  // If there is no cookie return empty object
  if (!cookie) {
    return {}
  }

  return parseCookie(cookie)
}

/**
 * Parsing query arguments from request `url` string
 * @param url of request
 * @returns Object with key name of query argument and its value
 */
export function parseQuery({ url }: IncomingMessage) {
  if (url) {
    const { query } = parse(url, true)
    return query
  } else {
    return {}
  }
}
