import type { BaseNextRequest, BaseNextResponse } from './base-http'
import { isNodeNextResponse } from './base-http/helpers'

import { pipeToNodeResponse } from './pipe-readable'
import { splitCookiesString } from './web/utils'

/**
 * Sends the response on the underlying next response object.
 *
 * @param req the underlying request object
 * @param res the underlying response object
 * @param response the response to send
 */
export async function sendResponse(
  req: BaseNextRequest,
  res: BaseNextResponse,
  response: Response,
  waitUntil?: Promise<unknown>
): Promise<void> {
  if (
    // The type check here ensures that `req` is correctly typed, and the
    // environment variable check provides dead code elimination.
    process.env.NEXT_RUNTIME !== 'edge' &&
    isNodeNextResponse(res)
  ) {
    // Copy over the response status.
    res.statusCode = response.status
    res.statusMessage = response.statusText

    // TODO: this is not spec-compliant behavior and we should not restrict
    // headers that are allowed to appear many times.
    //
    // See:
    // https://github.com/vercel/next.js/pull/70127
    const headersWithMultipleValuesAllowed = [
      // can add more headers to this list if needed
      'set-cookie',
      'www-authenticate',
      'proxy-authenticate',
      'vary',
    ]

    // Copy over the response headers.
    response.headers?.forEach((value, name) => {
      // `x-middleware-set-cookie` is an internal header not needed for the response
      if (name.toLowerCase() === 'x-middleware-set-cookie') {
        return
      }

      // The append handling is special cased for `set-cookie`.
      if (name.toLowerCase() === 'set-cookie') {
        // TODO: (wyattjoh) replace with native response iteration when we can upgrade undici
        for (const cookie of splitCookiesString(value)) {
          res.appendHeader(name, cookie)
        }
      } else {
        // only append the header if it is either not present in the outbound response
        // or if the header supports multiple values
        const isHeaderPresent = typeof res.getHeader(name) !== 'undefined'
        if (
          headersWithMultipleValuesAllowed.includes(name.toLowerCase()) ||
          !isHeaderPresent
        ) {
          res.appendHeader(name, value)
        }
      }
    })

    /**
     * The response can't be directly piped to the underlying response. The
     * following is duplicated from the edge runtime handler.
     *
     * See packages/next/server/next-server.ts
     */

    const { originalResponse } = res

    // A response body must not be sent for HEAD requests. See https://httpwg.org/specs/rfc9110.html#HEAD
    if (response.body && req.method !== 'HEAD') {
      await pipeToNodeResponse(response.body, originalResponse, waitUntil)
    } else {
      originalResponse.end()
    }
  }
}
