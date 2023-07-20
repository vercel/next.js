import type { OutgoingHttpHeaders } from 'http'

import { toOutgoingHeaders } from 'next/dist/compiled/@edge-runtime/node-utils'
import { splitCookiesString } from 'next/dist/compiled/@edge-runtime/cookies'

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
export { splitCookiesString }

/**
 * Converts a Headers object to a Node.js OutgoingHttpHeaders object. This is
 * required to support the set-cookie header, which may have multiple values.
 *
 * @param headers the headers object to convert
 * @returns the converted headers object
 */
export const toNodeOutgoingHttpHeaders = toOutgoingHeaders

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
