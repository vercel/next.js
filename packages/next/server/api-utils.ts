import type { IncomingMessage, ServerResponse } from 'http'
import type { PreviewData } from 'next/types'
import type { BaseNextRequest, BaseNextResponse } from './base-http'

import { parse } from 'next/dist/compiled/content-type'
import { NextApiRequest, NextApiResponse } from '../shared/lib/utils'
import { decryptWithSecret } from './crypto-utils'
import isError from '../lib/is-error'

export type NextApiRequestCookies = { [key: string]: string }
export type NextApiRequestQuery = { [key: string]: string | string[] }

export type __ApiPreviewProps = {
  previewModeId: string
  previewModeEncryptionKey: string
  previewModeSigningKey: string
}

/**
 * Parse incoming message like `json` or `urlencoded`
 * @param req request object
 */
export async function parseBody(
  req: IncomingMessage,
  limit: string | number
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
    const getRawBody =
      require('next/dist/compiled/raw-body') as typeof import('next/dist/compiled/raw-body')
    buffer = await getRawBody(req, { encoding, limit })
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
export function parseJson(str: string): object {
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
 * Parse cookies from the `headers` of request
 * @param req request object
 */
export function getCookieParser(headers: {
  [key: string]: undefined | string | string[]
}): () => NextApiRequestCookies {
  return function parseCookie(): NextApiRequestCookies {
    const header: undefined | string | string[] = headers.cookie

    if (!header) {
      return {}
    }

    const { parse: parseCookieFn } = require('next/dist/compiled/cookie')
    return parseCookieFn(Array.isArray(header) ? header.join(';') : header)
  }
}

/**
 *
 * @param res response object
 * @param statusCode `HTTP` status code of response
 */
export function sendStatusCode(
  res: NextApiResponse,
  statusCode: number
): NextApiResponse<any> {
  res.statusCode = statusCode
  return res
}

/**
 *
 * @param res response object
 * @param [statusOrUrl] `HTTP` status code of redirect
 * @param url URL of redirect
 */
export function redirect(
  res: NextApiResponse,
  statusOrUrl: string | number,
  url?: string
): NextApiResponse<any> {
  if (typeof statusOrUrl === 'string') {
    url = statusOrUrl
    statusOrUrl = 307
  }
  if (typeof statusOrUrl !== 'number' || typeof url !== 'string') {
    throw new Error(
      `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
    )
  }
  res.writeHead(statusOrUrl, { Location: url })
  res.write(url)
  res.end()
  return res
}

export const PRERENDER_REVALIDATE_HEADER = 'x-prerender-revalidate'

export function checkIsManualRevalidate(
  req: IncomingMessage | BaseNextRequest,
  previewProps: __ApiPreviewProps
): boolean {
  return req.headers[PRERENDER_REVALIDATE_HEADER] === previewProps.previewModeId
}

export const COOKIE_NAME_PRERENDER_BYPASS = `__prerender_bypass`
export const COOKIE_NAME_PRERENDER_DATA = `__next_preview_data`

export const SYMBOL_PREVIEW_DATA = Symbol(COOKIE_NAME_PRERENDER_DATA)
export const SYMBOL_CLEARED_COOKIES = Symbol(COOKIE_NAME_PRERENDER_BYPASS)

export function tryGetPreviewData(
  req: IncomingMessage | BaseNextRequest,
  res: ServerResponse | BaseNextResponse,
  options: __ApiPreviewProps
): PreviewData {
  // Read cached preview data if present
  if (SYMBOL_PREVIEW_DATA in req) {
    return (req as any)[SYMBOL_PREVIEW_DATA] as any
  }

  const getCookies = getCookieParser(req.headers)
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

  const jsonwebtoken =
    require('next/dist/compiled/jsonwebtoken') as typeof import('jsonwebtoken')
  let encryptedPreviewData: {
    data: string
  }
  try {
    encryptedPreviewData = jsonwebtoken.verify(
      tokenPreviewData,
      options.previewModeSigningKey
    ) as typeof encryptedPreviewData
  } catch {
    // TODO: warn
    clearPreviewData(res as NextApiResponse)
    return false
  }

  const decryptedPreviewData = decryptWithSecret(
    Buffer.from(options.previewModeEncryptionKey),
    encryptedPreviewData.data
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

export function clearPreviewData<T>(
  res: NextApiResponse<T>
): NextApiResponse<T> {
  if (SYMBOL_CLEARED_COOKIES in res) {
    return res
  }

  const { serialize } =
    require('next/dist/compiled/cookie') as typeof import('cookie')
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
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
    }),
    serialize(COOKIE_NAME_PRERENDER_DATA, '', {
      // To delete a cookie, set `expires` to a date in the past:
      // https://tools.ietf.org/html/rfc6265#section-4.1.1
      // `Max-Age: 0` is not valid, thus ignored, and the cookie is persisted.
      expires: new Date(0),
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
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
): void {
  res.statusCode = statusCode
  res.statusMessage = message
  res.end(message)
}

interface LazyProps {
  req: NextApiRequest
}

/**
 * Execute getter function only if its needed
 * @param LazyProps `req` and `params` for lazyProp
 * @param prop name of property
 * @param getter function to get data
 */
export function setLazyProp<T>(
  { req }: LazyProps,
  prop: string,
  getter: () => T
): void {
  const opts = { configurable: true, enumerable: true }
  const optsReset = { ...opts, writable: true }

  Object.defineProperty(req, prop, {
    ...opts,
    get: () => {
      const value = getter()
      // we set the property on the object to avoid recalculating it
      Object.defineProperty(req, prop, { ...optsReset, value })
      return value
    },
    set: (value) => {
      Object.defineProperty(req, prop, { ...optsReset, value })
    },
  })
}
