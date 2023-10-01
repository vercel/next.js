import type { NextConfigComplete } from '../config-shared'
import type { IncomingMessage, ServerResponse } from 'http'
import type { RenderServer } from './router-server'

import '../require-hook'
import '../node-polyfill-fetch'

import url from 'url'
import path from 'path'
import { findPageFile } from './find-page-file'
import { getRequestMeta } from '../request-meta'
import setupDebug from 'next/dist/compiled/debug'
import { getCloneableBody } from '../body-streams'
import { findPagesDir } from '../../lib/find-pages-dir'
import { setupFsCheck } from './router-utils/filesystem'
import { proxyRequest } from './router-utils/proxy-request'
import { getResolveRoutes } from './router-utils/resolve-routes'
import { PERMANENT_REDIRECT_STATUS } from '../../shared/lib/constants'
import { formatHostname } from './format-hostname'
import { signalFromNodeResponse } from '../web/spec-extension/adapters/next-request'
import { getMiddlewareRouteMatcher } from '../../shared/lib/router/utils/middleware-route-matcher'
import { pipeReadable } from '../pipe-readable'

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
  const { appDir, pagesDir } = findPagesDir(dir)
  // we format the hostname so that it can be fetched
  const fetchHostname = formatHostname(hostname)

  fsChecker.ensureCallback(async (item) => {
    let result: string | null = null

    if (item.type === 'appFile') {
      if (!appDir) {
        throw new Error('no app dir present')
      }
      result = await findPageFile(
        appDir,
        item.itemPath,
        nextConfig.pageExtensions,
        true
      )
    } else if (item.type === 'pageFile') {
      if (!pagesDir) {
        throw new Error('no pages dir present')
      }
      result = await findPageFile(
        pagesDir,
        item.itemPath,
        nextConfig.pageExtensions,
        false
      )
    }
    if (!result) {
      throw new Error(`failed to find page file ${item.type} ${item.itemPath}`)
    }
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

  if (middleware?.files.length) {
    fsChecker.middlewareMatcher = getMiddlewareRouteMatcher(
      middleware.matcher?.map((item) => ({
        regexp: item,
        originalSource: item,
      })) || [{ regexp: '.*', originalSource: '/:path*' }]
    )
  }

  const resolveRoutes = getResolveRoutes(
    fsChecker,
    nextConfig,
    {
      dir,
      port,
      hostname,
      isNodeDebugging: false,
      dev: true,
    },
    {
      async initialize() {
        return {
          async requestHandler(req, res) {
            if (!req.headers['x-middleware-invoke']) {
              throw new Error(`Invariant unexpected request handler call`)
            }

            const cloneableBody = getCloneableBody(req)
            const { run } =
              require('../web/sandbox') as typeof import('../web/sandbox')

            const result = await run({
              distDir,
              name: middlewareInfo.name || '/',
              paths: middlewareInfo.paths || [],
              edgeFunctionEntry: middlewareInfo,
              request: {
                headers: req.headers,
                method: req.method || 'GET',
                nextConfig: {
                  i18n: nextConfig.i18n,
                  basePath: nextConfig.basePath,
                  trailingSlash: nextConfig.trailingSlash,
                },
                url: `http://${fetchHostname}:${port}${req.url}`,
                body: cloneableBody,
                signal: signalFromNodeResponse(res),
              },
              useCache: true,
              onWarning: console.warn,
            })

            const err = new Error()
            ;(err as any).result = result
            throw err
          },
          async upgradeHandler() {
            throw new Error(`Invariant: unexpected upgrade handler call`)
          },
        }
      },
      deleteAppClientCache() {},
      async deleteCache() {},
      async clearModuleContext() {},
      async propagateServerField() {},
    } as Partial<RenderServer> as any,
    {} as any
  )

  return async function resolveRoute(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<RouteResult | void> {
    const routeResult = await resolveRoutes({
      req,
      res,
      isUpgradeReq: false,
      signal: signalFromNodeResponse(res),
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
