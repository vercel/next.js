import { IncomingMessage, IncomingHttpHeaders } from 'http'
import { parse as parseCookie } from 'cookie'
import { NextApiResponse, NextApiRequest } from '../lib/utils'
import { Stream } from 'stream'
import getRawBody from 'raw-body'

/**
 * Parse incoming message like `json` or `urlencoded`
 * @param req
 */
export async function parseBody(req: NextApiRequest) {
  const type = req.headers['content-type'] || 'text/plain'
  const encoding = getCharset(type)

  const buffer = await getRawBody(req, { encoding })

  const body = buffer.toString()

  if (type.startsWith('application/json')) {
    return parseJson(body)
  } else if (type.startsWith('application/x-www-form-urlencoded')) {
    const qs = require('querystring')
    return qs.decode(body)
  } else {
    return body
  }
}

/**
 * Parse `JSON` and handles invalid `JSON` strings
 * @param str `JSON` string
 */
function parseJson(str: string) {
  try {
    return JSON.parse(str)
  } catch (e) {
    throw new ApiError(400, 'Invalid JSON')
  }
}

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
export function parseQuery({ url, headers }: IncomingMessage) {
  if (url) {
    const params = new URL(`${headers.host}${url}`).searchParams

    return reduceParams(params.entries())
  } else {
    return {}
  }
}

/**
 * Send `any` body to response
 * @param res response object
 * @param statusCode `HTTP` status code of response
 * @param body of response
 */
export function sendData(res: NextApiResponse, statusCode: number, body: any) {
  res.statusCode = statusCode

  if (body === null) {
    res.end()
    return
  }

  const contentType = res.getHeader('Content-Type')

  if (Buffer.isBuffer(body)) {
    if (!contentType) {
      res.setHeader('Content-Type', 'application/octet-stream')
    }
    res.setHeader('Content-Length', body.length)
    res.end(body)
    return
  }

  if (body instanceof Stream) {
    if (!contentType) {
      res.setHeader('Content-Type', 'application/octet-stream')
    }
    body.pipe(res)
    return
  }

  let str = body

  // Stringyfy json body
  if (typeof body === 'object' || typeof body === 'number') {
    str = JSON.stringify(body)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
  }

  res.setHeader('Content-Length', Buffer.byteLength(str))
  res.end(str)
}

/**
 * Send `JSON` object
 * @param res response object
 * @param statusCode `HTTP` status code of response
 * @param jsonBody of data
 */
export function sendJson(
  res: NextApiResponse,
  statusCode: number,
  jsonBody: any,
): void {
  // Set header to application/json
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  // Use send to handle request
  res.send(statusCode, jsonBody)
}

function reduceParams(params: IterableIterator<[string, string]>) {
  const obj: any = {}
  for (const [key, value] of params) {
    obj[key] = value
  }
  return obj
}

/**
 * Parse `charset` from `content-type`
 * @param contentType string
 */
function getCharset(contentType: string) {
  const arr = contentType.split(';')
  const index = arr.findIndex((value) => value.startsWith('charset'))

  if (index > -1) {
    // Removes `charset=`
    return arr[index].slice(7)
  } else {
    return 'utf-8'
  }
}

/**
 * Custom error class
 */
export class ApiError extends Error {
  public statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

/**
 * Sends error in `response`
 * @param res response object
 * @param statusCode of response
 * @param message of response
 */
export function sendError(
  res: NextApiResponse,
  statusCode: number,
  message: string,
) {
  res.statusCode = statusCode
  res.statusMessage = message
  res.end()
}
