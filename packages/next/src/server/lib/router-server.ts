import type { IncomingMessage } from 'http'

// this must come first as it includes require hooks
import { initializeServerWorker } from './setup-server-worker'

import url from 'url'
import path from 'path'
import loadConfig from '../config'
import { serveStatic } from '../serve-static'
import setupDebug from 'next/dist/compiled/debug'
import { splitCookiesString, toNodeOutgoingHttpHeaders } from '../web/utils'
import { Telemetry } from '../../telemetry/storage'
import { DecodeError } from '../../shared/lib/utils'
import { filterReqHeaders } from './server-ipc/utils'
import { findPagesDir } from '../../lib/find-pages-dir'
import { setupFsCheck } from './router-utils/filesystem'
import { proxyRequest } from './router-utils/proxy-request'
import {
  invokeRequest,
  isAbortError,
  pipeReadable,
} from './server-ipc/invoke-request'
import { createRequestResponseMocks } from './mock-request'
import { createIpcServer, createWorker } from './server-ipc'
import { UnwrapPromise } from '../../lib/coalesced-function'
import { getResolveRoutes } from './router-utils/resolve-routes'
import { NextUrlWithParsedQuery, getRequestMeta } from '../request-meta'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'

import {
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER,
  PERMANENT_REDIRECT_STATUS,
} from '../../shared/lib/constants'
import { signalFromNodeResponse } from '../web/spec-extension/adapters/next-request'

let initializeResult:
  | undefined
  | {
      port: number
      hostname: string
    }

const debug = setupDebug('next:router-server:main')

export type RenderWorker = InstanceType<
  typeof import('next/dist/compiled/jest-worker').Worker
> & {
  initialize: typeof import('./render-server').initialize
  deleteCache: typeof import('./render-server').deleteCache
  deleteAppClientCache: typeof import('./render-server').deleteAppClientCache
  clearModuleContext: typeof import('./render-server').clearModuleContext
  propagateServerField: typeof import('./render-server').propagateServerField
}

export async function initialize(opts: {
  dir: string
  port: number
  dev: boolean
  minimalMode?: boolean
  hostname?: string
  workerType: 'router' | 'render'
  isNodeDebugging: boolean
  keepAliveTimeout?: number
  customServer?: boolean
}): Promise<NonNullable<typeof initializeResult>> {
  if (initializeResult) {
    return initializeResult
  }
  process.title = 'next-router-worker'

  if (!process.env.NODE_ENV) {
    // @ts-ignore not readonly
    process.env.NODE_ENV = opts.dev ? 'development' : 'production'
  }

  const config = await loadConfig(
    opts.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
    opts.dir,
    undefined,
    undefined,
    true
  )

  const fsChecker = await setupFsCheck({
    dev: opts.dev,
    dir: opts.dir,
    config,
    minimalMode: opts.minimalMode,
  })

  let devInstance:
    | UnwrapPromise<
        ReturnType<typeof import('./router-utils/setup-dev').setupDev>
      >
    | undefined

  if (opts.dev) {
    const telemetry = new Telemetry({
      distDir: path.join(opts.dir, config.distDir),
    })
    const { pagesDir, appDir } = findPagesDir(
      opts.dir,
      !!config.experimental.appDir
    )

    const { setupDev } = await require('./router-utils/setup-dev')
    devInstance = await setupDev({
      appDir,
      pagesDir,
      telemetry,
      fsChecker,
      dir: opts.dir,
      nextConfig: config,
      isCustomServer: opts.customServer,
    })
  }

  const renderWorkerOpts: Parameters<RenderWorker['initialize']>[0] = {
    port: opts.port,
    dir: opts.dir,
    workerType: 'render',
    hostname: opts.hostname,
    minimalMode: opts.minimalMode,
    dev: !!opts.dev,
    isNodeDebugging: !!opts.isNodeDebugging,
    serverFields: devInstance?.serverFields || {},
  }
  const renderWorkers: {
    app?: RenderWorker
    pages?: RenderWorker
  } = {}

  const { ipcPort, ipcValidationKey } = await createIpcServer({
    async ensurePage(
      match: Parameters<
        InstanceType<typeof import('../dev/hot-reloader').default>['ensurePage']
      >[0]
    ) {
      // TODO: remove after ensure is pulled out of server
      return await devInstance?.hotReloader.ensurePage(match)
    },
    async logErrorWithOriginalStack(...args: any[]) {
      // @ts-ignore
      return await devInstance?.logErrorWithOriginalStack(...args)
    },
    async getFallbackErrorComponents() {
      await devInstance?.hotReloader?.buildFallbackError()
      // Build the error page to ensure the fallback is built too.
      // TODO: See if this can be moved into hotReloader or removed.
      await devInstance?.hotReloader.ensurePage({
        page: '/_error',
        clientOnly: false,
      })
    },
    async getCompilationError(page: string) {
      const errors = await devInstance?.hotReloader?.getCompilationErrors(page)
      if (!errors) return

      // Return the very first error we found.
      return errors[0]
    },
    async revalidate({
      urlPath,
      revalidateHeaders,
      opts: revalidateOpts,
    }: {
      urlPath: string
      revalidateHeaders: IncomingMessage['headers']
      opts: any
    }) {
      const mocked = createRequestResponseMocks({
        url: urlPath,
        headers: revalidateHeaders,
      })

      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      await requestHandler(mocked.req, mocked.res)
      await mocked.res.hasStreamed

      if (
        mocked.res.getHeader('x-nextjs-cache') !== 'REVALIDATED' &&
        !(
          mocked.res.statusCode === 404 && revalidateOpts.unstable_onlyGenerated
        )
      ) {
        throw new Error(`Invalid response ${mocked.res.statusCode}`)
      }
      return {}
    },
  } as any)

  if (!!config.experimental.appDir) {
    renderWorkers.app = await createWorker(
      ipcPort,
      ipcValidationKey,
      opts.isNodeDebugging,
      'app',
      config
    )
  }
  renderWorkers.pages = await createWorker(
    ipcPort,
    ipcValidationKey,
    opts.isNodeDebugging,
    'pages',
    config
  )

  // pre-initialize workers
  await renderWorkers.app?.initialize(renderWorkerOpts)
  await renderWorkers.pages?.initialize(renderWorkerOpts)

  if (devInstance) {
    Object.assign(devInstance.renderWorkers, renderWorkers)
    ;(global as any)._nextDeleteCache = async (filePaths: string[]) => {
      try {
        await Promise.all([
          renderWorkers.pages?.deleteCache(filePaths),
          renderWorkers.app?.deleteCache(filePaths),
        ])
      } catch (err) {
        console.error(err)
      }
    }
    ;(global as any)._nextDeleteAppClientCache = async () => {
      try {
        await Promise.all([
          renderWorkers.pages?.deleteAppClientCache(),
          renderWorkers.app?.deleteAppClientCache(),
        ])
      } catch (err) {
        console.error(err)
      }
    }
    ;(global as any)._nextClearModuleContext = async (targetPath: string) => {
      try {
        await Promise.all([
          renderWorkers.pages?.clearModuleContext(targetPath),
          renderWorkers.app?.clearModuleContext(targetPath),
        ])
      } catch (err) {
        console.error(err)
      }
    }
  }

  const cleanup = () => {
    debug('router-server process cleanup')
    for (const curWorker of [
      ...((renderWorkers.app as any)?._workerPool?._workers || []),
      ...((renderWorkers.pages as any)?._workerPool?._workers || []),
    ] as {
      _child?: import('child_process').ChildProcess
    }[]) {
      curWorker._child?.kill('SIGKILL')
    }
  }
  process.on('exit', cleanup)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('uncaughtException', cleanup)
  process.on('unhandledRejection', cleanup)

  const resolveRoutes = getResolveRoutes(
    fsChecker,
    config,
    opts,
    renderWorkers,
    renderWorkerOpts,
    devInstance?.ensureMiddleware
  )

  const requestHandler: Parameters<typeof initializeServerWorker>[0] = async (
    req,
    res
  ) => {
    req.on('error', (_err) => {
      // TODO: log socket errors?
    })
    res.on('error', (_err) => {
      // TODO: log socket errors?
    })

    const matchedDynamicRoutes = new Set<string>()

    async function invokeRender(
      parsedUrl: NextUrlWithParsedQuery,
      type: keyof typeof renderWorkers,
      handleIndex: number,
      invokePath: string,
      additionalInvokeHeaders: Record<string, string> = {}
    ) {
      // invokeRender expects /api routes to not be locale prefixed
      // so normalize here before continuing
      if (
        config.i18n &&
        removePathPrefix(invokePath, config.basePath).startsWith(
          `/${parsedUrl.query.__nextLocale}/api`
        )
      ) {
        invokePath = fsChecker.handleLocale(
          removePathPrefix(invokePath, config.basePath)
        ).pathname
      }

      if (
        req.headers['x-nextjs-data'] &&
        fsChecker.getMiddlewareMatchers()?.length &&
        removePathPrefix(invokePath, config.basePath) === '/404'
      ) {
        res.setHeader('x-nextjs-matched-path', parsedUrl.pathname || '')
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end('{}')
        return null
      }

      const curWorker = renderWorkers[type]
      const workerResult = await curWorker?.initialize(renderWorkerOpts)

      if (!workerResult) {
        throw new Error(`Failed to initialize render worker ${type}`)
      }

      const renderUrl = `http://${workerResult.hostname}:${workerResult.port}${req.url}`

      const invokeHeaders: typeof req.headers = {
        ...req.headers,
        'x-middleware-invoke': '',
        'x-invoke-path': invokePath,
        'x-invoke-query': encodeURIComponent(JSON.stringify(parsedUrl.query)),
        ...(additionalInvokeHeaders || {}),
      }

      debug('invokeRender', renderUrl, invokeHeaders)

      let invokeRes
      try {
        invokeRes = await invokeRequest(
          renderUrl,
          {
            headers: invokeHeaders,
            method: req.method,
            signal: signalFromNodeResponse(res),
          },
          getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream()
        )
      } catch (e) {
        if (isAbortError(e)) {
          return
        }
        throw e
      }

      debug('invokeRender res', invokeRes.status, invokeRes.headers)

      // when we receive x-no-fallback we restart
      if (invokeRes.headers.get('x-no-fallback')) {
        // eslint-disable-next-line
        await handleRequest(handleIndex + 1)
        return
      }

      for (const [key, value] of Object.entries(
        filterReqHeaders(toNodeOutgoingHttpHeaders(invokeRes.headers))
      )) {
        if (value !== undefined) {
          if (key === 'set-cookie') {
            const curValue = res.getHeader(key) as string
            const newValue: string[] = [] as string[]

            for (const cookie of Array.isArray(curValue)
              ? curValue
              : splitCookiesString(curValue || '')) {
              newValue.push(cookie)
            }
            for (const val of (Array.isArray(value)
              ? value
              : value
              ? [value]
              : []) as string[]) {
              newValue.push(val)
            }
            res.setHeader(key, newValue)
          } else {
            res.setHeader(key, value as string)
          }
        }
      }
      res.statusCode = invokeRes.status || 200
      res.statusMessage = invokeRes.statusText || ''

      if (invokeRes.body) {
        await pipeReadable(invokeRes.body, res)
      } else {
        res.end()
      }
      return
    }

    const handleRequest = async (handleIndex: number) => {
      if (handleIndex > 5) {
        throw new Error(`Attempted to handle request too many times ${req.url}`)
      }

      // handle hot-reloader first
      if (devInstance) {
        const origUrl = req.url || '/'

        if (config.basePath && pathHasPrefix(origUrl, config.basePath)) {
          req.url = removePathPrefix(origUrl, config.basePath)
        }
        const parsedUrl = url.parse(req.url || '/')

        const hotReloaderResult = await devInstance.hotReloader.run(
          req,
          res,
          parsedUrl
        )

        if (hotReloaderResult.finished) {
          return hotReloaderResult
        }
        req.url = origUrl
      }

      const {
        finished,
        parsedUrl,
        statusCode,
        resHeaders,
        bodyStream,
        matchedOutput,
      } = await resolveRoutes(
        req,
        matchedDynamicRoutes,
        false,
        signalFromNodeResponse(res)
      )

      if (devInstance && matchedOutput?.type === 'devVirtualFsItem') {
        const origUrl = req.url || '/'

        if (config.basePath && pathHasPrefix(origUrl, config.basePath)) {
          req.url = removePathPrefix(origUrl, config.basePath)
        }

        if (resHeaders) {
          for (const key of Object.keys(resHeaders)) {
            res.setHeader(key, resHeaders[key])
          }
        }
        const result = await devInstance.requestHandler(req, res)

        if (result.finished) {
          return
        }
        // TODO: throw invariant if we resolved to this but it wasn't handled?
        req.url = origUrl
      }

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

      // apply any response headers from routing
      for (const key of Object.keys(resHeaders || {})) {
        res.setHeader(key, resHeaders[key])
      }

      // handle redirect
      if (!bodyStream && statusCode && statusCode > 300 && statusCode < 400) {
        const destination = url.format(parsedUrl)
        res.statusCode = statusCode
        res.setHeader('location', destination)

        if (statusCode === PERMANENT_REDIRECT_STATUS) {
          res.setHeader('Refresh', `0;url=${destination}`)
        }
        return res.end(destination)
      }

      // handle middleware body response
      if (bodyStream) {
        res.statusCode = statusCode || 200
        return await pipeReadable(bodyStream, res)
      }

      if (finished && parsedUrl.protocol) {
        return await proxyRequest(
          req,
          res,
          parsedUrl,
          undefined,
          getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream(),
          config.experimental.proxyTimeout
        )
      }

      if (matchedOutput?.fsPath && matchedOutput.itemPath) {
        if (
          opts.dev &&
          (fsChecker.appFiles.has(matchedOutput.itemPath) ||
            fsChecker.pageFiles.has(matchedOutput.itemPath))
        ) {
          await invokeRender(parsedUrl, 'pages', handleIndex, '/_error', {
            'x-invoke-status': '500',
            'x-invoke-error': JSON.stringify({
              message: `A conflicting public file and page file was found for path ${matchedOutput.itemPath} https://nextjs.org/docs/messages/conflicting-public-file-page`,
            }),
          })
          return
        }

        if (
          !res.getHeader('cache-control') &&
          matchedOutput.type === 'nextStaticFolder'
        ) {
          if (opts.dev) {
            res.setHeader('Cache-Control', 'no-store, must-revalidate')
          } else {
            res.setHeader(
              'Cache-Control',
              'public, max-age=31536000, immutable'
            )
          }
        }
        if (!(req.method === 'GET' || req.method === 'HEAD')) {
          res.setHeader('Allow', ['GET', 'HEAD'])
          return await invokeRender(
            url.parse('/405', true),
            'pages',
            handleIndex,
            '/405',
            {
              'x-invoke-status': '405',
            }
          )
        }

        try {
          return await serveStatic(req, res, matchedOutput.itemPath, {
            root: matchedOutput.itemsRoot,
          })
        } catch (err: any) {
          /**
           * Hardcoded every possible error status code that could be thrown by "serveStatic" method
           * This is done by searching "this.error" inside "send" module's source code:
           * https://github.com/pillarjs/send/blob/master/index.js
           * https://github.com/pillarjs/send/blob/develop/index.js
           */
          const POSSIBLE_ERROR_CODE_FROM_SERVE_STATIC = new Set([
            // send module will throw 500 when header is already sent or fs.stat error happens
            // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L392
            // Note: we will use Next.js built-in 500 page to handle 500 errors
            // 500,

            // send module will throw 404 when file is missing
            // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L421
            // Note: we will use Next.js built-in 404 page to handle 404 errors
            // 404,

            // send module will throw 403 when redirecting to a directory without enabling directory listing
            // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L484
            // Note: Next.js throws a different error (without status code) for directory listing
            // 403,

            // send module will throw 400 when fails to normalize the path
            // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L520
            400,

            // send module will throw 412 with conditional GET request
            // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L632
            412,

            // send module will throw 416 when range is not satisfiable
            // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L669
            416,
          ])

          let validErrorStatus = POSSIBLE_ERROR_CODE_FROM_SERVE_STATIC.has(
            err.statusCode
          )

          // normalize non-allowed status codes
          if (!validErrorStatus) {
            ;(err as any).statusCode = 400
          }

          if (typeof err.statusCode === 'number') {
            const invokePath = `/${err.statusCode}`
            const invokeStatus = `${err.statusCode}`
            return await invokeRender(
              url.parse(invokePath, true),
              'pages',
              handleIndex,
              invokePath,
              {
                'x-invoke-status': invokeStatus,
              }
            )
          }
          throw err
        }
      }

      if (matchedOutput) {
        return await invokeRender(
          parsedUrl,
          matchedOutput.type === 'appFile' ? 'app' : 'pages',
          handleIndex,
          parsedUrl.pathname || '/',
          {
            'x-invoke-output': matchedOutput.itemPath,
          }
        )
      }

      // 404 case
      res.setHeader(
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate'
      )

      const appNotFound = opts.dev
        ? devInstance?.serverFields.hasAppNotFound
        : await fsChecker.getItem('/_not-found')

      if (appNotFound) {
        return await invokeRender(
          parsedUrl,
          'app',
          handleIndex,
          '/_not-found',
          {
            'x-invoke-status': '404',
          }
        )
      }
      await invokeRender(parsedUrl, 'pages', handleIndex, '/404', {
        'x-invoke-status': '404',
      })
    }

    try {
      await handleRequest(0)
    } catch (err) {
      try {
        let invokePath = '/500'
        let invokeStatus = '500'

        if (err instanceof DecodeError) {
          invokePath = '/400'
          invokeStatus = '400'
        } else {
          console.error(err)
        }
        return await invokeRender(
          url.parse(invokePath, true),
          'pages',
          0,
          invokePath,
          {
            'x-invoke-status': invokeStatus,
          }
        )
      } catch (err2) {
        console.error(err2)
      }
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }

  const upgradeHandler: Parameters<typeof initializeServerWorker>[1] = async (
    req,
    socket,
    head
  ) => {
    try {
      req.on('error', (_err) => {
        // TODO: log socket errors?
        // console.error(_err);
      })
      socket.on('error', (_err) => {
        // TODO: log socket errors?
        // console.error(_err);
      })

      if (opts.dev && devInstance) {
        if (req.url?.includes(`/_next/webpack-hmr`)) {
          return devInstance.hotReloader.onHMR(req, socket, head)
        }
      }

      const { matchedOutput, parsedUrl } = await resolveRoutes(
        req,
        new Set(),
        true
      )

      // TODO: allow upgrade requests to pages/app paths?
      // this was not previously supported
      if (matchedOutput) {
        return socket.end()
      }

      if (parsedUrl.protocol) {
        return await proxyRequest(req, socket as any, parsedUrl, head)
      }
      // no match close socket
      socket.end()
    } catch (err) {
      console.error('Error handling upgrade request', err)
      socket.end()
    }
  }

  const { port, hostname } = await initializeServerWorker(
    requestHandler,
    upgradeHandler,
    opts
  )

  initializeResult = {
    port,
    hostname: hostname === '0.0.0.0' ? '127.0.0.1' : hostname,
  }

  return initializeResult
}
