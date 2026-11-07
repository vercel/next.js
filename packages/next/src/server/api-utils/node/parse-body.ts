import { once } from 'events'
import { IncomingMessage } from 'http'

import { parse } from 'next/dist/compiled/content-type'
import isError from '../../../lib/is-error'
import type { SizeLimit } from '../../../types'
import { ApiError } from '../index'

const BODY_HEADER = /^(content-length|transfer-encoding)$/i

// Loaded for the first request that has a body.
let getRawBody: typeof import('next/dist/compiled/raw-body') | undefined

/**
 * Whether the request may have a body. Node.js only reads a body for an HTTP/1
 * request that has a `Content-Length` or a `Transfer-Encoding` header
 * (https://www.rfc-editor.org/rfc/rfc9112#section-6.3).
 */
function mayHaveBody(req: IncomingMessage): boolean {
  if ('content-length' in req.headers || 'transfer-encoding' in req.headers) {
    return true
  }

  // Not a request that Node.js parsed: HTTP/2, mocked or built by hand.
  if (!(req instanceof IncomingMessage) || req.rawHeaders.length === 0) {
    return true
  }

  // A proxy can replace `req.headers`. `rawHeaders` has what was received.
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i]
    // Only a name of 14 (`content-length`) or 17 (`transfer-encoding`)
    // characters can match. Most names fail this test, which costs less than
    // the regular expression.
    if ((name.length === 14 || name.length === 17) && BODY_HEADER.test(name)) {
      return true
    }
  }

  return false
}

/**
 * Parse `JSON` and handles invalid `JSON` strings
 * @param str `JSON` string
 */
function parseJson(str: string): object {
  if (str.length === 0) {
    // special-case empty json body, as it's a common client-side mistake
    return {}
  }

  try {
    return JSON.parse(str)
  } catch (e) {
    throw new ApiError(400, 'Invalid JSON')
  }
}

/**
 * Parse incoming message like `json` or `urlencoded`
 * @param req request object
 */
export async function parseBody(
  req: IncomingMessage,
  limit: SizeLimit
): Promise<any> {
  let contentType
  try {
    contentType = parse(req.headers['content-type'] || 'text/plain')
  } catch {
    contentType = parse('text/plain')
  }
  const { type, parameters } = contentType
  const encoding = parameters.charset || 'utf-8'

  let buffer

  try {
    if (!mayHaveBody(req) && encoding.toLowerCase() === 'utf-8') {
      // No body in the default encoding is an empty string. This does not load
      // the body reader, which bundles every encoding it can decode. Any other
      // charset still goes to the body reader: only it knows which charsets it
      // supports, and it rejects a request that names another one. The request
      // is still read to its end, like the body reader leaves it.
      await once(req.resume(), 'end')
      buffer = ''
    } else {
      getRawBody ??=
        require('next/dist/compiled/raw-body') as typeof import('next/dist/compiled/raw-body')
      buffer = await getRawBody(req, { encoding, limit })
    }
  } catch (e) {
    if (isError(e) && e.type === 'entity.too.large') {
      throw new ApiError(413, `Body exceeded ${limit} limit`)
    } else {
      throw new ApiError(400, 'Invalid body')
    }
  }

  const body = buffer.toString()

  if (type === 'application/json' || type === 'application/ld+json') {
    return parseJson(body)
  } else if (type === 'application/x-www-form-urlencoded') {
    const qs = require('querystring') as typeof import('querystring')
    return qs.decode(body)
  } else {
    return body
  }
}
