import type { OutgoingHttpHeaders } from 'http'
import {
  NEXT_INTERCEPTION_MARKER_PREFIX,
  NEXT_QUERY_PARAM_PREFIX,
} from '../../lib/constants'

/**
 * Converts a Node.js IncomingHttpHeaders object to a Headers object. Any
 * headers with multiple values will be joined with a comma and space. Any
 * headers that have an undefined value will be ignored and others will be
 * coerced to strings.
 *
 * @param nodeHeaders the headers object to convert
 * @returns the converted headers object
 */
export function fromNodeOutgoingHttpHeaders(
  nodeHeaders: OutgoingHttpHeaders
): Headers {
  const headers = new Headers()
  for (let [key, value] of Object.entries(nodeHeaders)) {
    const values = Array.isArray(value) ? value : [value]
    for (let v of values) {
      if (typeof v === 'undefined') continue
      if (typeof v === 'number') {
        v = v.toString()
      }

      headers.append(key, v)
    }
  }
  return headers
}

/*
  Set-Cookie header field-values are sometimes comma joined in one string. This splits them without choking on commas
  that are within a single set-cookie field-value, such as in the Expires portion.
  This is uncommon, but explicitly allowed - see https://tools.ietf.org/html/rfc2616#section-4.2
  Node.js does this for every header *except* set-cookie - see https://github.com/nodejs/node/blob/d5e363b77ebaf1caf67cd7528224b651c86815c1/lib/_http_incoming.js#L128
  React Native's fetch does this for *every* header, including set-cookie.
  
  Based on: https://github.com/google/j2objc/commit/16820fdbc8f76ca0c33472810ce0cb03d20efe25
  Credits to: https://github.com/tomball for original and https://github.com/chrusart for JavaScript implementation
*/
export function splitCookiesString(cookiesString: string) {
  var cookiesStrings = []
  var pos = 0
  var start
  var ch
  var lastComma
  var nextStart
  var cookiesSeparatorFound

  function skipWhitespace() {
    while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
      pos += 1
    }
    return pos < cookiesString.length
  }

  function notSpecialChar() {
    ch = cookiesString.charAt(pos)

    return ch !== '=' && ch !== ';' && ch !== ','
  }

  while (pos < cookiesString.length) {
    start = pos
    cookiesSeparatorFound = false

    while (skipWhitespace()) {
      ch = cookiesString.charAt(pos)
      if (ch === ',') {
        // ',' is a cookie separator if we have later first '=', not ';' or ','
        lastComma = pos
        pos += 1

        skipWhitespace()
        nextStart = pos

        while (pos < cookiesString.length && notSpecialChar()) {
          pos += 1
        }

        // currently special character
        if (pos < cookiesString.length && cookiesString.charAt(pos) === '=') {
          // we found cookies separator
          cookiesSeparatorFound = true
          // pos is inside the next cookie, so back up and return it.
          pos = nextStart
          cookiesStrings.push(cookiesString.substring(start, lastComma))
          start = pos
        } else {
          // in param ',' or param separator ';',
          // we continue from that comma
          pos = lastComma + 1
        }
      } else {
        pos += 1
      }
    }

    if (!cookiesSeparatorFound || pos >= cookiesString.length) {
      cookiesStrings.push(cookiesString.substring(start, cookiesString.length))
    }
  }

  return cookiesStrings
}

/**
 * Converts a Headers object to a Node.js OutgoingHttpHeaders object. This is
 * required to support the set-cookie header, which may have multiple values.
 *
 * @param headers the headers object to convert
 * @returns the converted headers object
 */
export function toNodeOutgoingHttpHeaders(
  headers: Headers
): OutgoingHttpHeaders {
  const nodeHeaders: OutgoingHttpHeaders = {}
  const cookies: string[] = []
  if (headers) {
    for (const [key, value] of headers.entries()) {
      if (key.toLowerCase() === 'set-cookie') {
        // We may have gotten a comma joined string of cookies, or multiple
        // set-cookie headers. We need to merge them into one header array
        // to represent all the cookies.
        cookies.push(...splitCookiesString(value))
        nodeHeaders[key] = cookies.length === 1 ? cookies[0] : cookies
      } else {
        nodeHeaders[key] = value
      }
    }
  }
  return nodeHeaders
}

/**
 * Validate the correctness of a user-provided URL.
 */
export function validateURL(url: string | URL): string {
  try {
    return String(new URL(String(url)))
  } catch (error: any) {
    throw new Error(
      `URL is malformed "${String(
        url
      )}". Please use only absolute URLs - https://nextjs.org/docs/messages/middleware-relative-urls`,
      { cause: error }
    )
  }
}

/**
 * Normalizes `nxtP` and `nxtI` query param values to remove the prefix.
 * This function does not mutate the input key.
 */
export function normalizeNextQueryParam(key: string): null | string {
  const prefixes = [NEXT_QUERY_PARAM_PREFIX, NEXT_INTERCEPTION_MARKER_PREFIX]
  for (const prefix of prefixes) {
    if (key !== prefix && key.startsWith(prefix)) {
      return key.substring(prefix.length)
    }
  }
  return null
}
