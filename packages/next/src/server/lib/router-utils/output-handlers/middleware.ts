import { getProperError } from '../../../../lib/is-error'
import { urlQueryToSearchParams } from '../../../../shared/lib/router/utils/querystring'
import {
  DecodeError,
  MiddlewareNotFoundError,
} from '../../../../shared/lib/utils'
import { checkIsOnDemandRevalidate } from '../../../api-utils'
import { addRequestMeta, getRequestMeta } from '../../../request-meta'
import { NextResponse } from '../../../web/exports'
import { signalFromNodeResponse } from '../../../web/spec-extension/adapters/next-request'
import { splitCookiesString } from '../../../web/utils'
import { HandleOutputCtx } from '../handle-output'
import { getEdgeFunctionInfo } from './edge-function'

export async function handleMiddleware(ctx: HandleOutputCtx) {
  const {
    req,
    res,
    dev,
    port,
    hostname,
    ipcMethods,
    distDir,
    nextConfig,
    parsedUrl,
    fsChecker,
  } = ctx

  // Middleware is skipped for on-demand revalidate requests
  if (
    checkIsOnDemandRevalidate(req, fsChecker.prerenderManifest.preview)
      .isOnDemandRevalidate
  ) {
    return {
      response: NextResponse.next(),
      waitUntil: Promise.resolve(),
    }
  }

  try {
    let url: string

    if (nextConfig.skipMiddlewareUrlNormalize) {
      url = getRequestMeta(req, '__NEXT_INIT_URL')!
    } else {
      // For middleware to "fetch" we must always provide an absolute URL
      const query = urlQueryToSearchParams(parsedUrl.query).toString()
      const locale = parsedUrl.query.__nextLocale

      url = `${getRequestMeta(req, '_protocol')}://${hostname}:${port}${
        locale ? `/${locale}` : ''
      }${parsedUrl.pathname}${query ? `?${query}` : ''}`
    }

    if (!url.startsWith('http')) {
      throw new Error(
        'To use middleware you must provide a `hostname` and `port` to the Next.js Server'
      )
    }

    const page: {
      name?: string
      params?: { [key: string]: string | string[] }
    } = {}

    const middlewareInfo = getEdgeFunctionInfo({
      distDir,
      page: '/',
      middleware: true,
    })

    if (!middlewareInfo) {
      throw new MiddlewareNotFoundError()
    }

    const method = (req.method || 'GET').toUpperCase()
    const { run } =
      require('../../../web/sandbox') as typeof import('../../../web/sandbox')

    const result = await run({
      distDir,
      name: middlewareInfo.name,
      paths: middlewareInfo.paths,
      edgeFunctionEntry: middlewareInfo,
      request: {
        headers: req.headers,
        method,
        nextConfig: {
          basePath: nextConfig.basePath,
          i18n: nextConfig.i18n,
          trailingSlash: nextConfig.trailingSlash,
        },
        url: url,
        page: page,
        body: getRequestMeta(req, '__NEXT_CLONABLE_BODY'),
        signal: signalFromNodeResponse(res),
      },
      useCache: true,
      onWarning: (warn: any) =>
        dev ? ipcMethods.logErrorWithOriginalStack(warn, 'warning') : null,
    })

    if (!dev) {
      result.waitUntil.catch((error: any) => {
        console.error(`Uncaught: middleware waitUntil errored`, error)
      })
    }

    if (!result) {
      const err = new Error(`Not Found`)
      ;(err as any).statusCode = 404
      throw err
    }

    for (let [key, value] of result.response.headers) {
      if (key.toLowerCase() !== 'set-cookie') continue

      // Clear existing header.
      result.response.headers.delete(key)

      // Append each cookie individually.
      const cookies = splitCookiesString(value)
      for (const cookie of cookies) {
        result.response.headers.append(key, cookie)
      }

      // Add cookies to request meta.
      addRequestMeta(req, '_nextMiddlewareCookie', cookies)
    }

    result.waitUntil.catch((error) => {
      ipcMethods.logErrorWithOriginalStack(error, 'unhandledRejection')
    })
    return result
  } catch (error) {
    if (error instanceof DecodeError) {
      throw error
    }

    /**
     * We only log the error when it is not a MiddlewareNotFound error as
     * in that case we should be already displaying a compilation error
     * which is what makes the module not found.
     */
    if (!(error instanceof MiddlewareNotFoundError)) {
      ipcMethods.logErrorWithOriginalStack(error)
    }

    /**
     * When there is a failure for an internal Next.js request from
     * middleware we bypass the error without finishing the request
     * so we can serve the required chunks to render the error.
     */
    if (
      req.url?.includes('/_next/static') ||
      req.url?.includes('/__nextjs_original-stack-frame')
    ) {
      return {
        response: NextResponse.next(),
        waitUntil: Promise.resolve(),
      }
    }
    const err = getProperError(error)
    ;(err as any).middleware = true

    throw err
  }
}
