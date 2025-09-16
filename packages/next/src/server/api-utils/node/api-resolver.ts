import type { IncomingMessage, ServerResponse } from 'http'
import type { NextApiRequest, NextApiResponse } from '../../../shared/lib/utils'
import type { PageConfig, ResponseLimit } from '../../../types'
import type { __ApiPreviewProps } from '../.'
import type { CookieSerializeOptions } from 'next/dist/compiled/cookie'

import bytes from 'next/dist/compiled/bytes'
import { generateETag } from '../../lib/etag'
import { sendEtagResponse } from '../../send-payload'
import { Stream } from 'stream'
import isError from '../../../lib/is-error'
import { isResSent } from '../../../shared/lib/utils'
import { interopDefault } from '../../../lib/interop-default'
import {
  setLazyProp,
  sendStatusCode,
  redirect,
  clearPreviewData,
  sendError,
  ApiError,
  COOKIE_NAME_PRERENDER_BYPASS,
  COOKIE_NAME_PRERENDER_DATA,
  RESPONSE_LIMIT_DEFAULT,
} from './../index'
import { getCookieParser } from './../get-cookie-parser'
import {
  JSON_CONTENT_TYPE_HEADER,
  PRERENDER_REVALIDATE_HEADER,
  PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER,
} from '../../../lib/constants'
import { tryGetPreviewData } from './try-get-preview-data'
import { parseBody } from './parse-body'
import type { RevalidateFn } from '../../lib/router-utils/router-server-context'
import type { InstrumentationOnRequestError } from '../../instrumentation/types'

type ApiContext = __ApiPreviewProps & {
  trustHostHeader?: boolean
  allowedRevalidateHeaderKeys?: string[]
  hostname?: string
  multiZoneDraftMode?: boolean
  dev: boolean
  internalRevalidate?: RevalidateFn
}

function getMaxContentLength(responseLimit?: ResponseLimit) {
  if (responseLimit && typeof responseLimit !== 'boolean') {
    return bytes.parse(responseLimit)
  }
  return RESPONSE_LIMIT_DEFAULT
}

/**
 * Send `any` body to response
 * @param req request object
 * @param res response object
 * @param body of response
 */
function sendData(req: NextApiRequest, res: NextApiResponse, body: any): void {
  if (body === null || body === undefined) {
    res.end()
    return
  }

  // strip irrelevant headers/body
  if (res.statusCode === 204 || res.statusCode === 304) {
    res.removeHeader('Content-Type')
    res.removeHeader('Content-Length')
    res.removeHeader('Transfer-Encoding')

    if (process.env.NODE_ENV === 'development' && body) {
      console.warn(
        `A body was attempted to be set with a 204 statusCode for ${req.url}, this is invalid and the body was ignored.\n` +
          `See more info here https://nextjs.org/docs/messages/invalid-api-status-body`
      )
    }
    res.end()
    return
  }

  const contentType = res.getHeader('Content-Type')

  if (body instanceof Stream) {
    if (!contentType) {
      res.setHeader('Content-Type', 'application/octet-stream')
    }
    body.pipe(res)
    return
  }

  const isJSONLike = ['object', 'number', 'boolean'].includes(typeof body)
  const stringifiedBody = isJSONLike ? JSON.stringify(body) : body
  const etag = generateETag(stringifiedBody)
  if (sendEtagResponse(req, res, etag)) {
    return
  }

  if (Buffer.isBuffer(body)) {
    if (!contentType) {
      res.setHeader('Content-Type', 'application/octet-stream')
    }
    res.setHeader('Content-Length', body.length)
    res.end(body)
    return
  }

  if (isJSONLike) {
    res.setHeader('Content-Type', JSON_CONTENT_TYPE_HEADER)
  }

  res.setHeader('Content-Length', Buffer.byteLength(stringifiedBody))
  res.end(stringifiedBody)
}

/**
 * Send `JSON` object
 * @param res response object
 * @param jsonBody of data
 */
function sendJson(res: NextApiResponse, jsonBody: any): void {
  // Set header to application/json
  res.setHeader('Content-Type', JSON_CONTENT_TYPE_HEADER)

  // Use send to handle request
  res.send(JSON.stringify(jsonBody))
}

function isValidData(str: any): str is string {
  return typeof str === 'string' && str.length >= 16
}

function setDraftMode<T>(
  res: NextApiResponse<T>,
  options: {
    enable: boolean
    previewModeId?: string
  }
): NextApiResponse<T> {
  if (!isValidData(options.previewModeId)) {
    throw new Error('invariant: invalid previewModeId')
  }
  const expires = options.enable ? undefined : new Date(0)
  // To delete a cookie, set `expires` to a date in the past:
  // https://tools.ietf.org/html/rfc6265#section-4.1.1
  // `Max-Age: 0` is not valid, thus ignored, and the cookie is persisted.
  const { serialize } =
    require('next/dist/compiled/cookie') as typeof import('next/dist/compiled/cookie')
  const previous = res.getHeader('Set-Cookie')
  res.setHeader(`Set-Cookie`, [
    ...(typeof previous === 'string'
      ? [previous]
      : Array.isArray(previous)
        ? previous
        : []),
    serialize(COOKIE_NAME_PRERENDER_BYPASS, options.previewModeId, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
      expires,
    }),
  ])
  return res
}

function setPreviewData<T>(
  res: NextApiResponse<T>,
  data: object | string, // TODO: strict runtime type checking
  options: {
    maxAge?: number
    path?: string
  } & __ApiPreviewProps
): NextApiResponse<T> {
  if (!isValidData(options.previewModeId)) {
    throw new Error('invariant: invalid previewModeId')
  }
  if (!isValidData(options.previewModeEncryptionKey)) {
    throw new Error('invariant: invalid previewModeEncryptionKey')
  }
  if (!isValidData(options.previewModeSigningKey)) {
    throw new Error('invariant: invalid previewModeSigningKey')
  }

  const jsonwebtoken =
    require('next/dist/compiled/jsonwebtoken') as typeof import('next/dist/compiled/jsonwebtoken')
  const { encryptWithSecret } =
    require('../../crypto-utils') as typeof import('../../crypto-utils')
  const payload = jsonwebtoken.sign(
    {
      data: encryptWithSecret(
        Buffer.from(options.previewModeEncryptionKey),
        JSON.stringify(data)
      ),
    },
    options.previewModeSigningKey,
    {
      algorithm: 'HS256',
      ...(options.maxAge !== undefined
        ? { expiresIn: options.maxAge }
        : undefined),
    }
  )

  // limit preview mode cookie to 2KB since we shouldn't store too much
  // data here and browsers drop cookies over 4KB
  if (payload.length > 2048) {
    throw new Error(
      `Preview data is limited to 2KB currently, reduce how much data you are storing as preview data to continue`
    )
  }

  const { serialize } =
    require('next/dist/compiled/cookie') as typeof import('next/dist/compiled/cookie')
  const previous = res.getHeader('Set-Cookie')
  res.setHeader(`Set-Cookie`, [
    ...(typeof previous === 'string'
      ? [previous]
      : Array.isArray(previous)
        ? previous
        : []),
    serialize(COOKIE_NAME_PRERENDER_BYPASS, options.previewModeId, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
      ...(options.maxAge !== undefined
        ? ({ maxAge: options.maxAge } as CookieSerializeOptions)
        : undefined),
      ...(options.path !== undefined
        ? ({ path: options.path } as CookieSerializeOptions)
        : undefined),
    }),
    serialize(COOKIE_NAME_PRERENDER_DATA, payload, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
      ...(options.maxAge !== undefined
        ? ({ maxAge: options.maxAge } as CookieSerializeOptions)
        : undefined),
      ...(options.path !== undefined
        ? ({ path: options.path } as CookieSerializeOptions)
        : undefined),
    }),
  ])
  return res
}

async function revalidate(
  urlPath: string,
  opts: {
    unstable_onlyGenerated?: boolean
  },
  req: IncomingMessage,
  context: ApiContext
) {
  if (typeof urlPath !== 'string' || !urlPath.startsWith('/')) {
    throw new Error(
      `Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received ${urlPath}`
    )
  }
  const revalidateHeaders: HeadersInit = {
    [PRERENDER_REVALIDATE_HEADER]: context.previewModeId,
    ...(opts.unstable_onlyGenerated
      ? {
          [PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER]: '1',
        }
      : {}),
  }
  const allowedRevalidateHeaderKeys = [
    ...(context.allowedRevalidateHeaderKeys || []),
  ]

  if (context.trustHostHeader || context.dev) {
    allowedRevalidateHeaderKeys.push('cookie')
  }

  if (context.trustHostHeader) {
    allowedRevalidateHeaderKeys.push('x-vercel-protection-bypass')
  }

  for (const key of Object.keys(req.headers)) {
    if (allowedRevalidateHeaderKeys.includes(key)) {
      revalidateHeaders[key] = req.headers[key] as string
    }
  }

  const internalRevalidate = context.internalRevalidate

  try {
    // We use the revalidate in router-server if available.
    // If we are operating without router-server (serverless)
    // we must go through network layer with fetch request
    if (internalRevalidate) {
      return await internalRevalidate({
        urlPath,
        revalidateHeaders,
        opts,
      })
    }

    if (context.trustHostHeader) {
      const res = await fetch(`https://${req.headers.host}${urlPath}`, {
        method: 'HEAD',
        headers: revalidateHeaders,
      })
      // we use the cache header to determine successful revalidate as
      // a non-200 status code can be returned from a successful revalidate
      // e.g. notFound: true returns 404 status code but is successful
      const cacheHeader =
        res.headers.get('x-vercel-cache') || res.headers.get('x-nextjs-cache')

      if (
        cacheHeader?.toUpperCase() !== 'REVALIDATED' &&
        res.status !== 200 &&
        !(res.status === 404 && opts.unstable_onlyGenerated)
      ) {
        throw new Error(`Invalid response ${res.status}`)
      }
    } else {
      throw new Error(
        `Invariant: missing internal router-server-methods this is an internal bug`
      )
    }
  } catch (err: unknown) {
    throw new Error(
      `Failed to revalidate ${urlPath}: ${isError(err) ? err.message : err}`
    )
  }
}

export async function apiResolver(
  req: IncomingMessage,
  res: ServerResponse,
  query: any,
  resolverModule: any,
  apiContext: ApiContext,
  propagateError: boolean,
  dev?: boolean,
  page?: string,
  onError?: InstrumentationOnRequestError
): Promise<void> {
  const apiReq = req as NextApiRequest
  const apiRes = res as NextApiResponse

  try {
    if (!resolverModule) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }
    const config: PageConfig = resolverModule.config || {}
    const bodyParser = config.api?.bodyParser !== false
    const responseLimit = config.api?.responseLimit ?? true
    const externalResolver = config.api?.externalResolver || false

    // Parsing of cookies
    setLazyProp({ req: apiReq }, 'cookies', getCookieParser(req.headers))
    // Parsing query string
    apiReq.query = query
    // Parsing preview data
    setLazyProp({ req: apiReq }, 'previewData', () =>
      tryGetPreviewData(req, res, apiContext, !!apiContext.multiZoneDraftMode)
    )
    // Checking if preview mode is enabled
    setLazyProp({ req: apiReq }, 'preview', () =>
      apiReq.previewData !== false ? true : undefined
    )
    // Set draftMode to the same value as preview
    setLazyProp({ req: apiReq }, 'draftMode', () => apiReq.preview)

    // Parsing of body
    if (bodyParser && !apiReq.body) {
      apiReq.body = await parseBody(
        apiReq,
        config.api && config.api.bodyParser && config.api.bodyParser.sizeLimit
          ? config.api.bodyParser.sizeLimit
          : '1mb'
      )
    }

    let contentLength = 0
    const maxContentLength = getMaxContentLength(responseLimit)
    const writeData = apiRes.write
    const endResponse = apiRes.end
    apiRes.write = (...args: any[2]) => {
      contentLength += Buffer.byteLength(args[0] || '')
      return writeData.apply(apiRes, args)
    }
    apiRes.end = (...args: any[2]) => {
      if (args.length && typeof args[0] !== 'function') {
        contentLength += Buffer.byteLength(args[0] || '')
      }

      if (responseLimit && contentLength >= maxContentLength) {
        console.warn(
          `API response for ${req.url} exceeds ${bytes.format(
            maxContentLength
          )}. API Routes are meant to respond quickly. https://nextjs.org/docs/messages/api-routes-response-size-limit`
        )
      }

      return endResponse.apply(apiRes, args)
    }
    apiRes.status = (statusCode) => sendStatusCode(apiRes, statusCode)
    apiRes.send = (data) => sendData(apiReq, apiRes, data)
    apiRes.json = (data) => sendJson(apiRes, data)
    apiRes.redirect = (statusOrUrl: number | string, url?: string) =>
      redirect(apiRes, statusOrUrl, url)
    apiRes.setDraftMode = (options = { enable: true }) =>
      setDraftMode(apiRes, Object.assign({}, apiContext, options))
    apiRes.setPreviewData = (data, options = {}) =>
      setPreviewData(apiRes, data, Object.assign({}, apiContext, options))
    apiRes.clearPreviewData = (options = {}) =>
      clearPreviewData(apiRes, options)
    apiRes.revalidate = (
      urlPath: string,
      opts?: {
        unstable_onlyGenerated?: boolean
      }
    ) => revalidate(urlPath, opts || {}, req, apiContext)

    const resolver = interopDefault(resolverModule)
    let wasPiped = false

    if (process.env.NODE_ENV !== 'production') {
      // listen for pipe event and don't show resolve warning
      res.once('pipe', () => (wasPiped = true))
    }

    const apiRouteResult = await resolver(req, res)

    if (process.env.NODE_ENV !== 'production') {
      if (typeof apiRouteResult !== 'undefined') {
        if (apiRouteResult instanceof Response) {
          throw new Error(
            'API route returned a Response object in the Node.js runtime, this is not supported. Please use `runtime: "edge"` instead: https://nextjs.org/docs/api-routes/edge-api-routes'
          )
        }
        console.warn(
          `API handler should not return a value, received ${typeof apiRouteResult}.`
        )
      }

      if (!externalResolver && !isResSent(res) && !wasPiped) {
        console.warn(
          `API resolved without sending a response for ${req.url}, this may result in stalled requests.`
        )
      }
    }
  } catch (err) {
    await onError?.(
      err,
      {
        method: req.method || 'GET',
        headers: req.headers,
        path: req.url || '/',
      },
      {
        routerKind: 'Pages Router',
        routePath: page || '',
        routeType: 'route',
        revalidateReason: undefined,
      }
    )

    if (err instanceof ApiError) {
      sendError(apiRes, err.statusCode, err.message)
    } else {
      if (dev) {
        if (isError(err)) {
          err.page = page
        }
        throw err
      }

      console.error(err)
      if (propagateError) {
        throw err
      }
      sendError(apiRes, 500, 'Internal Server Error')
    }
  }
}
