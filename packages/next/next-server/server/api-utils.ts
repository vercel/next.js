import { parse } from 'content-type'
import { CookieSerializeOptions } from 'cookie'
import { IncomingMessage, ServerResponse } from 'http'
import { PageConfig } from 'next/types'
import getRawBody from 'raw-body'
import { Stream } from 'stream'
import { isResSent, NextApiRequest, NextApiResponse } from '../lib/utils'
import { decryptWithSecret, encryptWithSecret } from './crypto-utils'
import { interopDefault } from './load-components'
import { Params } from './router'

export type NextApiRequestCookies = { [key: string]: string }
export type NextApiRequestQuery = { [key: string]: string | string[] }

export type __ApiPreviewProps = {
  previewModeId: string
  previewModeEncryptionKey: string
  previewModeSigningKey: string
}

export async function apiResolver(
  req: IncomingMessage,
  res: ServerResponse,
  params: any,
  resolverModule: any,
  apiContext: __ApiPreviewProps,
  onError?: ({ err }: { err: any }) => Promise<void>
) {
  const apiReq = req as NextApiRequest
  const apiRes = res as NextApiResponse

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
    setLazyProp({ req: apiReq }, 'cookies', getCookieParser(req))
    // Parsing query string
    setLazyProp({ req: apiReq, params }, 'query', getQueryParser(req))
    // // Parsing of body
    if (bodyParser) {
      apiReq.body = await parseBody(
        apiReq,
        config.api && config.api.bodyParser && config.api.bodyParser.sizeLimit
          ? config.api.bodyParser.sizeLimit
          : '1mb'
      )
    }

    apiRes.status = statusCode => sendStatusCode(apiRes, statusCode)
    apiRes.send = data => sendData(apiRes, data)
    apiRes.json = data => sendJson(apiRes, data)
    apiRes.setPreviewData = (data, options = {}) =>
      setPreviewData(apiRes, data, Object.assign({}, apiContext, options))
    apiRes.clearPreviewData = () => clearPreviewData(apiRes)

    const resolver = interopDefault(resolverModule)
    let wasPiped = false

    if (process.env.NODE_ENV !== 'production') {
      // listen for pipe event and don't show resolve warning
      res.once('pipe', () => (wasPiped = true))
    }

    // Call API route method
    await resolver(req, res)

    if (process.env.NODE_ENV !== 'production' && !isResSent(res) && !wasPiped) {
      console.warn(
        `API resolved without sending a response for ${req.url}, this may result in stalled requests.`
      )
    }
  } catch (err) {
    if (err instanceof ApiError) {
      sendError(apiRes, err.statusCode, err.message)
    } else {
      console.error(err)
      if (onError) await onError({ err })
      sendError(apiRes, 500, 'Internal Server Error')
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
      if (query[key]) {
        if (Array.isArray(query[key])) {
          ;(query[key] as string[]).push(value)
        } else {
          query[key] = [query[key], value]
        }
      } else {
        query[key] = value
      }
    }

    return query
  }
}

/**
 * Parse cookies from `req` header
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
  if (
    typeof body === 'object' ||
    typeof body === 'number' ||
    typeof body === 'boolean'
  ) {
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

const COOKIE_NAME_PRERENDER_BYPASS = `__prerender_bypass`
const COOKIE_NAME_PRERENDER_DATA = `__next_preview_data`

export const SYMBOL_PREVIEW_DATA = Symbol(COOKIE_NAME_PRERENDER_DATA)
const SYMBOL_CLEARED_COOKIES = Symbol(COOKIE_NAME_PRERENDER_BYPASS)

export function tryGetPreviewData(
  req: IncomingMessage,
  res: ServerResponse,
  options: __ApiPreviewProps
): object | string | false {
  // Read cached preview data if present
  if (SYMBOL_PREVIEW_DATA in req) {
    return (req as any)[SYMBOL_PREVIEW_DATA] as any
  }

  const getCookies = getCookieParser(req)
  let cookies: NextApiRequestCookies
  try {
    cookies = getCookies()
  } catch {
    // TODO: warn
    return false
  }

  const hasBypass = COOKIE_NAME_PRERENDER_BYPASS in cookies
  const hasData = COOKIE_NAME_PRERENDER_DATA in cookies

  // Case: neither cookie is set.
  if (!(hasBypass || hasData)) {
    return false
  }

  // Case: one cookie is set, but not the other.
  if (hasBypass !== hasData) {
    clearPreviewData(res as NextApiResponse)
    return false
  }

  // Case: preview session is for an old build.
  if (cookies[COOKIE_NAME_PRERENDER_BYPASS] !== options.previewModeId) {
    clearPreviewData(res as NextApiResponse)
    return false
  }

  const tokenPreviewData = cookies[COOKIE_NAME_PRERENDER_DATA]

  const jsonwebtoken = require('jsonwebtoken') as typeof import('jsonwebtoken')
  let encryptedPreviewData: string
  try {
    encryptedPreviewData = jsonwebtoken.verify(
      tokenPreviewData,
      options.previewModeSigningKey
    ) as string
  } catch {
    // TODO: warn
    clearPreviewData(res as NextApiResponse)
    return false
  }

  const decryptedPreviewData = decryptWithSecret(
    Buffer.from(options.previewModeEncryptionKey),
    encryptedPreviewData
  )

  try {
    // TODO: strict runtime type checking
    const data = JSON.parse(decryptedPreviewData)
    // Cache lookup
    Object.defineProperty(req, SYMBOL_PREVIEW_DATA, {
      value: data,
      enumerable: false,
    })
    return data
  } catch {
    return false
  }
}

function setPreviewData<T>(
  res: NextApiResponse<T>,
  data: object | string, // TODO: strict runtime type checking
  options: {
    maxAge?: number
  } & __ApiPreviewProps
): NextApiResponse<T> {
  if (
    typeof options.previewModeId !== 'string' ||
    options.previewModeId.length < 16
  ) {
    throw new Error('invariant: invalid previewModeId')
  }
  if (
    typeof options.previewModeEncryptionKey !== 'string' ||
    options.previewModeEncryptionKey.length < 16
  ) {
    throw new Error('invariant: invalid previewModeEncryptionKey')
  }
  if (
    typeof options.previewModeSigningKey !== 'string' ||
    options.previewModeSigningKey.length < 16
  ) {
    throw new Error('invariant: invalid previewModeSigningKey')
  }

  const jsonwebtoken = require('jsonwebtoken') as typeof import('jsonwebtoken')

  const payload = jsonwebtoken.sign(
    encryptWithSecret(
      Buffer.from(options.previewModeEncryptionKey),
      JSON.stringify(data)
    ),
    options.previewModeSigningKey,
    {
      algorithm: 'HS256',
      ...(options.maxAge !== undefined
        ? { expiresIn: options.maxAge }
        : undefined),
    }
  )

  const { serialize } = require('cookie') as typeof import('cookie')
  const previous = res.getHeader('Set-Cookie')
  res.setHeader(`Set-Cookie`, [
    ...(typeof previous === 'string'
      ? [previous]
      : Array.isArray(previous)
      ? previous
      : []),
    serialize(COOKIE_NAME_PRERENDER_BYPASS, options.previewModeId, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      ...(options.maxAge !== undefined
        ? ({ maxAge: options.maxAge } as CookieSerializeOptions)
        : undefined),
    }),
    serialize(COOKIE_NAME_PRERENDER_DATA, payload, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      ...(options.maxAge !== undefined
        ? ({ maxAge: options.maxAge } as CookieSerializeOptions)
        : undefined),
    }),
  ])
  return res
}

function clearPreviewData<T>(res: NextApiResponse<T>): NextApiResponse<T> {
  if (SYMBOL_CLEARED_COOKIES in res) {
    return res
  }

  const { serialize } = require('cookie') as typeof import('cookie')
  const previous = res.getHeader('Set-Cookie')
  res.setHeader(`Set-Cookie`, [
    ...(typeof previous === 'string'
      ? [previous]
      : Array.isArray(previous)
      ? previous
      : []),
    serialize(COOKIE_NAME_PRERENDER_BYPASS, '', {
      // To delete a cookie, set `expires` to a date in the past:
      // https://tools.ietf.org/html/rfc6265#section-4.1.1
      // `Max-Age: 0` is not valid, thus ignored, and the cookie is persisted.
      expires: new Date(0),
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    }),
    serialize(COOKIE_NAME_PRERENDER_DATA, '', {
      // To delete a cookie, set `expires` to a date in the past:
      // https://tools.ietf.org/html/rfc6265#section-4.1.1
      // `Max-Age: 0` is not valid, thus ignored, and the cookie is persisted.
      expires: new Date(0),
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    }),
  ])

  Object.defineProperty(res, SYMBOL_CLEARED_COOKIES, {
    value: true,
    enumerable: false,
  })
  return res
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
