import { once } from 'events'
import { IncomingMessage } from 'http'

import { parse } from 'next/dist/compiled/content-type'
import isError from '../../../lib/is-error'
import type { SizeLimit } from '../../../types'
import { ApiError } from '../index'

/**
 * Whether the request can have a body. Node.js only reads a body for an HTTP/1
 * request that announces one with a `Content-Length` or `Transfer-Encoding`
 * header (https://www.rfc-editor.org/rfc/rfc9112#section-6.3). The headers are
 * checked as they were received, because `req.headers` can be rewritten before
 * the route runs. Any other kind of request object, like an HTTP/2 or a mocked
 * request, is assumed to have a body.
 */
function hasBody(req: IncomingMessage): boolean {
  if (
    !(req instanceof IncomingMessage) ||
    req.httpVersionMajor !== 1 ||
    req.rawHeaders.length === 0
  ) {
    return true
  }

  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase()
    if (name === 'content-length' || name === 'transfer-encoding') {
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
    if (encoding === 'utf-8' && !hasBody(req)) {
      // Reading no body in the default encoding results in an empty string. The
      // body reader, which bundles every character encoding it can decode, is
      // only loaded once there is a body to read or another charset to check.
      // The request is still read to its end, so that the handler gets it in
      // the same state as after reading a body.
      await once(req.resume(), 'end')
      buffer = ''
    } else {
      const getRawBody =
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
