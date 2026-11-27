import type { BaseNextRequest, BaseNextResponse } from './base-http'
import { isNodeNextResponse } from './base-http/helpers'

import { pipeToNodeResponse } from './pipe-readable'
import { splitCookiesString } from './web/utils'

// The body may have been transparently decoded (e.g. fetch decompresses a
// gzip body but preserves the original headers), in which case forwarding
// these headers produces invalid response framing. Matches FORBIDDEN_HEADERS
// in web/sandbox/sandbox.ts.
const FORBIDDEN_HEADERS = [
  'content-length',
  'content-encoding',
  'transfer-encoding',
]

// A handler-set Content-Length is only forwarded when it is verified to
// match the bytes that will actually be sent. A Response produced by
// fetch() may have been transparently decoded while keeping the original
// headers, so forwarding an unverified length would produce invalid
// framing (see GHSA-pc58-hwjq-p385). Verification reads a clone of the
// body and is bounded: bodies larger than this keep the current behaviour
// (the header is dropped and Node uses chunked framing). Verification also
// delays the first byte until the body has been read, so it only applies
// to responses that declare a Content-Length in the first place.
const MAX_VERIFIED_CONTENT_LENGTH_BYTES = 10 * 1024 * 1024

/**
 * Returns the handler-set Content-Length when it is proven to match the
 * response body, otherwise null. A null return keeps the existing
 * behaviour of dropping the header.
 */
async function getVerifiedContentLength(
  response: Response
): Promise<number | null> {
  const raw = response.headers.get('content-length')
  if (raw === null) return null

  const declared = Number(raw)
  if (!Number.isSafeInteger(declared) || declared < 0) return null

  if (response.body === null) {
    // There is no body to send, so only a zero length is truthful.
    return declared === 0 ? 0 : null
  }

  // Read a clone so the original body is still available to pipe. Reading
  // stops as soon as the count exceeds the declared length (stale header)
  // or the verification cap (large body), so at most the cap is buffered.
  let counted = 0
  try {
    const reader = response.clone().body!.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      counted += value?.byteLength ?? 0
      if (counted > declared || counted > MAX_VERIFIED_CONTENT_LENGTH_BYTES) {
        // Do NOT await the cancel: cancelling one branch of a tee returns
        // a promise that only settles once the other branch is cancelled
        // too, so awaiting it would hang here. Firing it is enough to
        // release the branch's backpressure on the original body.
        reader.cancel()
        return null
      }
    }
  } catch {
    return null
  }

  return counted === declared ? declared : null
}

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

    // A handler-set Content-Length is forwarded only after verification
    // (see getVerifiedContentLength). Unverified lengths stay dropped, as
    // before, so decoded fetch() bodies cannot produce invalid framing.
    const verifiedContentLength = await getVerifiedContentLength(response)

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

      if (FORBIDDEN_HEADERS.includes(name)) {
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
        const isHeaderPresent = res.hasHeader(name)
        if (
          headersWithMultipleValuesAllowed.includes(name.toLowerCase()) ||
          !isHeaderPresent
        ) {
          res.appendHeader(name, value)
        }
      }
    })

    if (verifiedContentLength !== null) {
      // Set as a plain string: consumers such as the compression
      // middleware expect string header values.
      res.setHeader('content-length', String(verifiedContentLength))
    }

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
