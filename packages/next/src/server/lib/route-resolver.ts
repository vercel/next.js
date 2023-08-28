import type { NextConfigComplete } from '../config-shared'
import type { IncomingMessage, ServerResponse } from 'http'

import '../require-hook'
import '../node-polyfill-fetch'

import fs from 'fs'
import url from 'url'
import path from 'path'
import { getRequestMeta } from '../request-meta'
import setupDebug from 'next/dist/compiled/debug'
import { setupFsCheck } from './router-utils/filesystem'
import { proxyRequest } from './router-utils/proxy-request'
import { getResolveRoutes } from './router-utils/resolve-routes'
import {
  MIDDLEWARE_MANIFEST,
  PERMANENT_REDIRECT_STATUS,
} from '../../shared/lib/constants'
import { getMiddlewareRouteMatcher } from '../../shared/lib/router/utils/middleware-route-matcher'
import { pipeReadable } from '../pipe-readable'
import ResponseCache from '../response-cache'

type RouteResult =
  | {
      type: 'rewrite'
      url: string
      statusCode: number
      headers: Record<string, undefined | number | string | string[]>
    }
  | {
      type: 'error'
      error: {
        name: string
        message: string
        stack: any[]
      }
    }
  | {
      type: 'none'
    }

type MiddlewareConfig = {
  matcher: string[] | null
  files: string[]
}

type ServerAddress = {
  hostname?: string
  port?: number
}

const debug = setupDebug('next:router-server')

export async function makeResolver(
  dir: string,
  nextConfig: NextConfigComplete,
  middleware: MiddlewareConfig,
  { hostname = 'localhost', port = 3000 }: Partial<ServerAddress>
) {
  const fsChecker = await setupFsCheck({
    dir,
    dev: true,
    minimalMode: false,
    config: nextConfig,
  })
  const distDir = path.join(dir, nextConfig.distDir)
  const middlewareInfo = middleware
    ? {
        name: 'middleware',
        paths: middleware.files.map((file) => path.join(process.cwd(), file)),
        wasm: [],
        assets: [],
      }
    : {}

  await fs.promises.writeFile(
    path.join(distDir, 'server', MIDDLEWARE_MANIFEST + '.json'),
    JSON.stringify({
      middleware: middlewareInfo,
    })
  )

  if (middleware?.files.length) {
    fsChecker.middlewareMatcher = getMiddlewareRouteMatcher(
      middleware.matcher?.map((item) => ({
        regexp: item,
        originalSource: item,
      })) || [{ regexp: '.*', originalSource: '/:path*' }]
    )
  }

  const resolveRoutes = getResolveRoutes({
    fsChecker,
    config: nextConfig,
    opts: {
      dir,
      port,
      hostname,
      isNodeDebugging: false,
      dev: true,
      workerType: 'render',
    },
    ensureMiddleware: async () => {},
    requestHandler: () => {},
    ipcMethods: {},
    distDir,
    responseCache: new ResponseCache(false),
  })

  return async function resolveRoute(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<RouteResult | void> {
    const routeResult = await resolveRoutes({
      req,
      res,
      isUpgradeReq: false,
    })

    const {
      matchedOutput,
      bodyStream,
      statusCode,
      parsedUrl,
      resHeaders,
      finished,
    } = routeResult

    debug('requestHandler!', req.url, {
      matchedOutput,
      statusCode,
      resHeaders,
      bodyStream: !!bodyStream,
      parsedUrl: {
        pathname: parsedUrl.pathname,
        query: parsedUrl.query,
      },
      finished,
    })

    for (const key of Object.keys(resHeaders || {})) {
      res.setHeader(key, resHeaders[key])
    }

    if (!bodyStream && statusCode && statusCode > 300 && statusCode < 400) {
      const destination = url.format(parsedUrl)
      res.statusCode = statusCode
      res.setHeader('location', destination)

      if (statusCode === PERMANENT_REDIRECT_STATUS) {
        res.setHeader('Refresh', `0;url=${destination}`)
      }
      res.end(destination)
      return
    }

    // handle middleware body response
    if (bodyStream) {
      res.statusCode = statusCode || 200

      if (Buffer.isBuffer(bodyStream)) {
        res.end(bodyStream)
        return
      }
      return await pipeReadable(bodyStream, res)
    }

    if (finished && parsedUrl.protocol) {
      await proxyRequest(
        req,
        res,
        parsedUrl,
        undefined,
        getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream(),
        nextConfig.experimental.proxyTimeout
      )
      return
    }

    res.setHeader('x-nextjs-route-result', '1')
    res.end()

    return {
      type: 'rewrite',
      statusCode: 200,
      headers: resHeaders,
      url: url.format(parsedUrl),
    }
  }
}
