import { IncomingMessage } from 'http'
import { NextApiResponse, NextApiRequest } from '../lib/utils'
import { Stream } from 'stream'
import getRawBody from 'raw-body'
import { URL } from 'url'
import { parse } from 'content-type'

/**
 * Parse incoming message like `json` or `urlencoded`
 * @param req
 */
export async function parseBody(req: NextApiRequest, limit: string = '1mb') {
  const contentType = parse(req.headers['content-type'] || 'text/plain')
  const { type, parameters } = contentType
  const encoding = parameters.charset || 'utf-8'

  let buffer

  try {
    buffer = await getRawBody(req, { encoding, limit })
  } catch (e) {
    if (e.type === 'entity.too.large') {
      throw new ApiError(413, `Body exceeded ${limit} limit`)
    } else {
      throw new ApiError(400, 'Invalid body')
    }
  }

  const body = buffer.toString()

  if (type === 'application/json' || type === 'application/ld+json') {
    return parseJson(body)
  } else if (type === 'application/x-www-form-urlencoded') {
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
 * Parsing query arguments from request `url` string
 * @param url of request
 * @returns Object with key name of query argument and its value
 */
export function parseQuery({ url }: IncomingMessage) {
  if (url) {
    // This is just for parsing search params, base it's not important
    const params = new URL(url, 'https://n').searchParams

    return reduceParams(params.entries())
  } else {
    return {}
  }
}

/**
 *
 * @param res response object
 * @param statusCode `HTTP` status code of response
 */
export function sendStatusCode(res: NextApiResponse, statusCode: number) {
  res.statusCode = statusCode
  return res
}

/**
 * Send `any` body to response
 * @param res response object
 * @param body of response
 */
export function sendData(res: NextApiResponse, body: any) {
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

  // Stringify JSON body
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
 * @param jsonBody of data
 */
export function sendJson(res: NextApiResponse, jsonBody: any): void {
  // Set header to application/json
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  // Use send to handle request
  res.send(jsonBody)
}

function reduceParams(params: IterableIterator<[string, string]>) {
  const obj: any = {}
  for (const [key, value] of params) {
    obj[key] = value
  }
  return obj
}

/**
 * Custom error class
 */
export class ApiError extends Error {
  readonly statusCode: number

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
  message: string
) {
  res.statusCode = statusCode
  res.statusMessage = message
  res.end()
}
