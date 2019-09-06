import { IncomingMessage } from 'http'
import { NextApiResponse, NextApiRequest } from '../lib/utils'
import { Stream } from 'stream'
import getRawBody from 'raw-body'
import { parse } from 'content-type'
import { Params } from './router'
import { PageConfig } from '../../types'
import { interopDefault } from './load-components'

export type NextApiRequestCookies = { [key: string]: string }
export type NextApiRequestQuery = { [key: string]: string | string[] }

export async function apiResolver(
  req: NextApiRequest,
  res: NextApiResponse,
  params: any,
  resolverModule: any
) {
  try {
    let config: PageConfig = {}
    let bodyParser = true
    if (!resolverModule) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    if (resolverModule.config) {
      config = resolverModule.config
      if (config.api && config.api.bodyParser === false) {
        bodyParser = false
      }
    }
    // Parsing of cookies
    setLazyProp({ req }, 'cookies', getCookieParser(req))
    // Parsing query string
    setLazyProp({ req, params }, 'query', getQueryParser(req))
    // // Parsing of body
    if (bodyParser) {
      req.body = await parseBody(
        req,
        config.api && config.api.bodyParser && config.api.bodyParser.sizeLimit
          ? config.api.bodyParser.sizeLimit
          : '1mb'
      )
    }

    res.status = statusCode => sendStatusCode(res, statusCode)
    res.send = data => sendData(res, data)
    res.json = data => sendJson(res, data)

    const resolver = interopDefault(resolverModule)
    resolver(req, res)
  } catch (e) {
    if (e instanceof ApiError) {
      sendError(res, e.statusCode, e.message)
    } else {
      console.error(e)
      sendError(res, 500, 'Internal Server Error')
    }
  }
}

/**
 * Parse incoming message like `json` or `urlencoded`
 * @param req request object
 */
export async function parseBody(req: NextApiRequest, limit: string | number) {
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
export function getQueryParser({ url }: IncomingMessage) {
  return function parseQuery(): NextApiRequestQuery {
    const { URL } = require('url')
    // we provide a placeholder base url because we only want searchParams
    const params = new URL(url, 'https://n').searchParams

    const query: { [key: string]: string | string[] } = {}
    for (const [key, value] of params) {
      query[key] = value
    }

    return query
  }
}

/**
 * Parse cookeies from `req` header
 * @param req request object
 */
export function getCookieParser(req: IncomingMessage) {
  return function parseCookie(): NextApiRequestCookies {
    const header: undefined | string | string[] = req.headers.cookie

    if (!header) {
      return {}
    }

    const { parse } = require('cookie')
    return parse(Array.isArray(header) ? header.join(';') : header)
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
  res.end(message)
}

interface LazyProps {
  req: NextApiRequest
  params?: Params | boolean
}

/**
 * Execute getter function only if its needed
 * @param LazyProps `req` and `params` for lazyProp
 * @param prop name of property
 * @param getter function to get data
 */
export function setLazyProp<T>(
  { req, params }: LazyProps,
  prop: string,
  getter: () => T
) {
  const opts = { configurable: true, enumerable: true }
  const optsReset = { ...opts, writable: true }

  Object.defineProperty(req, prop, {
    ...opts,
    get: () => {
      let value = getter()
      if (params && typeof params !== 'boolean') {
        value = { ...value, ...params }
      }
      // we set the property on the object to avoid recalculating it
      Object.defineProperty(req, prop, { ...optsReset, value })
      return value
    },
    set: value => {
      Object.defineProperty(req, prop, { ...optsReset, value })
    },
  })
}
