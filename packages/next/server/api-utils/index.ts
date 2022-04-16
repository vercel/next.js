import type { IncomingMessage } from 'http'
import type { BaseNextRequest } from '../base-http'

import { NextApiRequest, NextApiResponse } from '../../shared/lib/utils'

export type NextApiRequestCookies = { [key: string]: string }
export type NextApiRequestQuery = { [key: string]: string | string[] }

export type __ApiPreviewProps = {
  previewModeId: string
  previewModeEncryptionKey: string
  previewModeSigningKey: string
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
export const PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER =
  'x-prerender-revalidate-if-generated'

export function checkIsManualRevalidate(
  req: IncomingMessage | BaseNextRequest,
  previewProps: __ApiPreviewProps
): {
  isManualRevalidate: boolean
  revalidateOnlyGenerated: boolean
} {
  return {
    isManualRevalidate:
      req.headers[PRERENDER_REVALIDATE_HEADER] === previewProps.previewModeId,
    revalidateOnlyGenerated:
      !!req.headers[PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER],
  }
}

export const COOKIE_NAME_PRERENDER_BYPASS = `__prerender_bypass`
export const COOKIE_NAME_PRERENDER_DATA = `__next_preview_data`

export const RESPONSE_LIMIT_DEFAULT = 4 * 1024 * 1024

export const SYMBOL_PREVIEW_DATA = Symbol(COOKIE_NAME_PRERENDER_DATA)
export const SYMBOL_CLEARED_COOKIES = Symbol(COOKIE_NAME_PRERENDER_BYPASS)

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
