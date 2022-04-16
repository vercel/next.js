import type { __ApiPreviewProps } from '../api-utils'
import type { CustomRoutes } from '../../lib/load-custom-routes'
import type { FetchEventResult } from '../web/types'
import type { FindComponentsResult } from '../next-server'
import type { LoadComponentsReturnType } from '../load-components'
import type { Options as ServerOptions } from '../next-server'
import type { Params } from '../router'
import type { ParsedNextUrl } from '../../shared/lib/router/utils/parse-next-url'
import type { ParsedUrlQuery } from 'querystring'
import type { Server as HTTPServer } from 'http'
import type { UrlWithParsedQuery } from 'url'
import type { BaseNextRequest, BaseNextResponse } from '../base-http'

import crypto from 'crypto'
import fs from 'fs'
import chalk from 'next/dist/compiled/chalk'
import { Worker } from 'next/dist/compiled/jest-worker'
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import findUp from 'next/dist/compiled/find-up'
import { join as pathJoin, relative, resolve as pathResolve, sep } from 'path'
import React from 'react'
import Watchpack from 'next/dist/compiled/watchpack'
import { ampValidation } from '../../build/output'
import { PUBLIC_DIR_MIDDLEWARE_CONFLICT } from '../../lib/constants'
import { fileExists } from '../../lib/file-exists'
import { findPagesDir } from '../../lib/find-pages-dir'
import loadCustomRoutes from '../../lib/load-custom-routes'
import { verifyTypeScriptSetup } from '../../lib/verifyTypeScriptSetup'
import { verifyPartytownSetup } from '../../lib/verify-partytown-setup'
import {
  PHASE_DEVELOPMENT_SERVER,
  CLIENT_STATIC_FILES_PATH,
  DEV_CLIENT_PAGES_MANIFEST,
  DEV_MIDDLEWARE_MANIFEST,
} from '../../shared/lib/constants'
import {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../../shared/lib/router/utils'
import Server, { WrappedBuildError } from '../next-server'
import { normalizePagePath } from '../normalize-page-path'
import Router, { route } from '../router'
import { hasBasePath, replaceBasePath } from '../router-utils'
import { eventCliSession } from '../../telemetry/events'
import { Telemetry } from '../../telemetry/storage'
import { setGlobal } from '../../trace'
import HotReloader from './hot-reloader'
import { findPageFile } from '../lib/find-page-file'
import { getNodeOptionsWithoutInspect } from '../lib/utils'
import { withCoalescedInvoke } from '../../lib/coalesced-function'
import { loadDefaultErrorComponents } from '../load-components'
import { DecodeError } from '../../shared/lib/utils'
import {
  createOriginalStackFrame,
  getSourceById,
  parseStack,
} from 'next/dist/compiled/@next/react-dev-overlay/middleware'
import * as Log from '../../build/output/log'
import isError, { getProperError } from '../../lib/is-error'
import { getMiddlewareRegex } from '../../shared/lib/router/utils/get-middleware-regex'
import { isCustomErrorPage, isReservedPage } from '../../build/utils'
import { NodeNextResponse, NodeNextRequest } from '../base-http/node'
import { getPageRuntime, invalidatePageRuntimeCache } from '../../build/entries'

// Load ReactDevOverlay only when needed
let ReactDevOverlayImpl: React.FunctionComponent
const ReactDevOverlay = (props: any) => {
  if (ReactDevOverlayImpl === undefined) {
    ReactDevOverlayImpl =
      require('next/dist/compiled/@next/react-dev-overlay/client').ReactDevOverlay
  }
  return ReactDevOverlayImpl(props)
}

export interface Options extends ServerOptions {
  /**
   * The HTTP Server that Next.js is running behind
   */
  httpServer?: HTTPServer
  /**
   * Tells of Next.js is running from the `next dev` command
   */
  isNextDevCommand?: boolean
}

export default class DevServer extends Server {
  private devReady: Promise<void>
  private setDevReady?: Function
  private webpackWatcher?: Watchpack | null
  private hotReloader?: HotReloader
  private isCustomServer: boolean
  protected sortedRoutes?: string[]
  private addedUpgradeListener = false

  protected staticPathsWorker?: { [key: string]: any } & {
    loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
  }

  private getStaticPathsWorker(): { [key: string]: any } & {
    loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
  } {
    if (this.staticPathsWorker) {
      return this.staticPathsWorker
    }
    this.staticPathsWorker = new Worker(
      require.resolve('./static-paths-worker'),
      {
        maxRetries: 1,
        numWorkers: this.nextConfig.experimental.cpus,
        enableWorkerThreads: this.nextConfig.experimental.workerThreads,
        forkOptions: {
          env: {
            ...process.env,
            // discard --inspect/--inspect-brk flags from process.env.NODE_OPTIONS. Otherwise multiple Node.js debuggers
            // would be started if user launch Next.js in debugging mode. The number of debuggers is linked to
            // the number of workers Next.js tries to launch. The only worker users are interested in debugging
            // is the main Next.js one
            NODE_OPTIONS: getNodeOptionsWithoutInspect(),
          },
        },
      }
    ) as Worker & {
      loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
    }

    this.staticPathsWorker.getStdout().pipe(process.stdout)
    this.staticPathsWorker.getStderr().pipe(process.stderr)

    return this.staticPathsWorker
  }

  constructor(options: Options) {
    super({ ...options, dev: true })
    this.renderOpts.dev = true
    ;(this.renderOpts as any).ErrorDebug = ReactDevOverlay
    this.devReady = new Promise((resolve) => {
      this.setDevReady = resolve
    })
    ;(this.renderOpts as any).ampSkipValidation =
      this.nextConfig.experimental?.amp?.skipValidation ?? false
    ;(this.renderOpts as any).ampValidator = (
      html: string,
      pathname: string
    ) => {
      const validatorPath =
        this.nextConfig.experimental &&
        this.nextConfig.experimental.amp &&
        this.nextConfig.experimental.amp.validator
      return AmpHtmlValidator.getInstance(validatorPath).then((validator) => {
        const result = validator.validateString(html)
        ampValidation(
          pathname,
          result.errors
            .filter((e) => e.severity === 'ERROR')
            .filter((e) => this._filterAmpDevelopmentScript(html, e)),
          result.errors.filter((e) => e.severity !== 'ERROR')
        )
      })
    }
    if (fs.existsSync(pathJoin(this.dir, 'static'))) {
      console.warn(
        `The static directory has been deprecated in favor of the public directory. https://nextjs.org/docs/messages/static-dir-deprecated`
      )
    }

    // setup upgrade listener eagerly when we can otherwise
    // it will be done on the first request via req.socket.server
    if (options.httpServer) {
      this.setupWebSocketHandler(options.httpServer)
    }

    this.isCustomServer = !options.isNextDevCommand
    this.pagesDir = findPagesDir(this.dir)
  }

  protected getBuildId(): string {
    return 'development'
  }

  async addExportPathMapRoutes() {
    // Makes `next export` exportPathMap work in development mode.
    // So that the user doesn't have to define a custom server reading the exportPathMap
    if (this.nextConfig.exportPathMap) {
      console.log('Defining routes from exportPathMap')
      const exportPathMap = await this.nextConfig.exportPathMap(
        {},
        {
          dev: true,
          dir: this.dir,
          outDir: null,
          distDir: this.distDir,
          buildId: this.buildId,
        }
      ) // In development we can't give a default path mapping
      for (const path in exportPathMap) {
        const { page, query = {} } = exportPathMap[path]

        // We use unshift so that we're sure the routes is defined before Next's default routes
        this.router.addFsRoute({
          match: route(path),
          type: 'route',
          name: `${path} exportpathmap route`,
          fn: async (req, res, _params, parsedUrl) => {
            const { query: urlQuery } = parsedUrl

            Object.keys(urlQuery)
              .filter((key) => query[key] === undefined)
              .forEach((key) =>
                console.warn(
                  `Url '${path}' defines a query parameter '${key}' that is missing in exportPathMap`
                )
              )

            const mergedQuery = { ...urlQuery, ...query }

            await this.render(req, res, page, mergedQuery, parsedUrl, true)
            return {
              finished: true,
            }
          },
        })
      }
    }
  }

  async startWatcher(): Promise<void> {
    if (this.webpackWatcher) {
      return
    }

    const regexMiddleware = new RegExp(
      `[\\\\/](_middleware.(?:${this.nextConfig.pageExtensions.join('|')}))$`
    )

    const regexPageExtension = new RegExp(
      `\\.+(?:${this.nextConfig.pageExtensions.join('|')})$`
    )

    let resolved = false
    return new Promise((resolve, reject) => {
      const pagesDir = this.pagesDir

      // Watchpack doesn't emit an event for an empty directory
      fs.readdir(pagesDir!, (_, files) => {
        if (files?.length) {
          return
        }

        if (!resolved) {
          resolve()
          resolved = true
        }
      })

      let wp = (this.webpackWatcher = new Watchpack())
      wp.watch([], [pagesDir!], 0)

      wp.on('aggregated', async () => {
        const routedMiddleware = []
        const routedPages = []
        const knownFiles = wp.getTimeInfoEntries()
        const ssrMiddleware = new Set<string>()

        for (const [fileName, { accuracy, safeTime }] of knownFiles) {
          if (accuracy === undefined || !regexPageExtension.test(fileName)) {
            continue
          }

          if (regexMiddleware.test(fileName)) {
            routedMiddleware.push(
              `/${relative(pagesDir!, fileName).replace(/\\+/g, '/')}`
                .replace(/^\/+/g, '/')
                .replace(regexMiddleware, '/')
            )
            continue
          }

          let pageName =
            '/' + relative(pagesDir!, fileName).replace(/\\+/g, '/')
          pageName = pageName.replace(regexPageExtension, '')
          pageName = pageName.replace(/\/index$/, '') || '/'

          invalidatePageRuntimeCache(fileName, safeTime)
          const pageRuntimeConfig = await getPageRuntime(
            fileName,
            this.nextConfig
          )
          const isEdgeRuntime = pageRuntimeConfig === 'edge'

          if (
            isEdgeRuntime &&
            !(isReservedPage(pageName) || isCustomErrorPage(pageName))
          ) {
            routedMiddleware.push(pageName)
            ssrMiddleware.add(pageName)
          }

          routedPages.push(pageName)
        }

        this.middleware = getSortedRoutes(routedMiddleware).map((page) => ({
          match: getRouteMatcher(
            getMiddlewareRegex(page, !ssrMiddleware.has(page))
          ),
          page,
          ssr: ssrMiddleware.has(page),
        }))

        try {
          // we serve a separate manifest with all pages for the client in
          // dev mode so that we can match a page after a rewrite on the client
          // before it has been built and is populated in the _buildManifest
          const sortedRoutes = getSortedRoutes(routedPages)

          if (
            !this.sortedRoutes?.every((val, idx) => val === sortedRoutes[idx])
          ) {
            // emit the change so clients fetch the update
            this.hotReloader!.send(undefined, { devPagesManifest: true })
          }
          this.sortedRoutes = sortedRoutes

          this.dynamicRoutes = this.sortedRoutes
            .filter(isDynamicRoute)
            .map((page) => ({
              page,
              match: getRouteMatcher(getRouteRegex(page)),
            }))

          this.router.setDynamicRoutes(this.dynamicRoutes)

          if (!resolved) {
            resolve()
            resolved = true
          }
        } catch (e) {
          if (!resolved) {
            reject(e)
            resolved = true
          } else {
            console.warn('Failed to reload dynamic routes:', e)
          }
        }
      })
    })
  }

  async stopWatcher(): Promise<void> {
    if (!this.webpackWatcher) {
      return
    }

    this.webpackWatcher.close()
    this.webpackWatcher = null
  }

  async prepare(): Promise<void> {
    setGlobal('distDir', this.distDir)
    setGlobal('phase', PHASE_DEVELOPMENT_SERVER)
    await verifyTypeScriptSetup(
      this.dir,
      this.pagesDir!,
      false,
      this.nextConfig
    )

    this.customRoutes = await loadCustomRoutes(this.nextConfig)

    // reload router
    const { redirects, rewrites, headers } = this.customRoutes

    if (
      rewrites.beforeFiles.length ||
      rewrites.afterFiles.length ||
      rewrites.fallback.length ||
      redirects.length ||
      headers.length
    ) {
      this.router = new Router(this.generateRoutes())
    }

    this.hotReloader = new HotReloader(this.dir, {
      pagesDir: this.pagesDir!,
      distDir: this.distDir,
      config: this.nextConfig,
      previewProps: this.getPreviewProps(),
      buildId: this.buildId,
      rewrites,
    })
    await super.prepare()
    await this.addExportPathMapRoutes()
    await this.hotReloader.start()
    await this.startWatcher()
    this.setDevReady!()

    if (this.nextConfig.experimental.nextScriptWorkers) {
      await verifyPartytownSetup(
        this.dir,
        pathJoin(this.distDir, CLIENT_STATIC_FILES_PATH)
      )
    }

    const telemetry = new Telemetry({ distDir: this.distDir })
    telemetry.record(
      eventCliSession(this.distDir, this.nextConfig, {
        webpackVersion: 5,
        cliCommand: 'dev',
        isSrcDir: relative(this.dir, this.pagesDir!).startsWith('src'),
        hasNowJson: !!(await findUp('now.json', { cwd: this.dir })),
        isCustomServer: this.isCustomServer,
      })
    )
    // This is required by the tracing subsystem.
    setGlobal('telemetry', telemetry)

    process.on('unhandledRejection', (reason) => {
      this.logErrorWithOriginalStack(reason, 'unhandledRejection').catch(
        () => {}
      )
    })
    process.on('uncaughtException', (err) => {
      this.logErrorWithOriginalStack(err, 'uncaughtException').catch(() => {})
    })
  }

  protected async close(): Promise<void> {
    await this.stopWatcher()
    await this.getStaticPathsWorker().end()
    if (this.hotReloader) {
      await this.hotReloader.stop()
    }
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    let normalizedPath: string

    try {
      normalizedPath = normalizePagePath(pathname)
    } catch (err) {
      console.error(err)
      // if normalizing the page fails it means it isn't valid
      // so it doesn't exist so don't throw and return false
      // to ensure we return 404 instead of 500
      return false
    }

    const pageFile = await findPageFile(
      this.pagesDir!,
      normalizedPath,
      this.nextConfig.pageExtensions
    )
    return !!pageFile
  }

  protected async _beforeCatchAllRender(
    req: BaseNextRequest,
    res: BaseNextResponse,
    params: Params,
    parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    const { pathname } = parsedUrl
    const pathParts = params.path || []
    const path = `/${pathParts.join('/')}`
    // check for a public file, throwing error if there's a
    // conflicting page
    let decodedPath: string

    try {
      decodedPath = decodeURIComponent(path)
    } catch (_) {
      throw new DecodeError('failed to decode param')
    }

    if (await this.hasPublicFile(decodedPath)) {
      if (await this.hasPage(pathname!)) {
        const err = new Error(
          `A conflicting public file and page file was found for path ${pathname} https://nextjs.org/docs/messages/conflicting-public-file-page`
        )
        res.statusCode = 500
        await this.renderError(err, req, res, pathname!, {})
        return true
      }
      await this.servePublic(req, res, pathParts)
      return true
    }

    return false
  }

  private setupWebSocketHandler(server?: HTTPServer, _req?: NodeNextRequest) {
    if (!this.addedUpgradeListener) {
      this.addedUpgradeListener = true
      server = server || (_req?.originalRequest.socket as any)?.server

      if (!server) {
        // this is very unlikely to happen but show an error in case
        // it does somehow
        Log.error(
          `Invalid IncomingMessage received, make sure http.createServer is being used to handle requests.`
        )
      } else {
        const { basePath } = this.nextConfig

        server.on('upgrade', (req, socket, head) => {
          let assetPrefix = (this.nextConfig.assetPrefix || '').replace(
            /^\/+/,
            ''
          )

          // assetPrefix can be a proxy server with a url locally
          // if so, it's needed to send these HMR requests with a rewritten url directly to /_next/webpack-hmr
          // otherwise account for a path-like prefix when listening to socket events
          if (assetPrefix.startsWith('http')) {
            assetPrefix = ''
          } else if (assetPrefix) {
            assetPrefix = `/${assetPrefix}`
          }

          if (
            req.url?.startsWith(
              `${basePath || assetPrefix || ''}/_next/webpack-hmr`
            )
          ) {
            this.hotReloader?.onHMR(req, socket, head)
          }
        })
      }
    }
  }

  async runMiddleware(params: {
    request: BaseNextRequest
    response: BaseNextResponse
    parsedUrl: ParsedNextUrl
    parsed: UrlWithParsedQuery
  }): Promise<FetchEventResult | null> {
    try {
      const result = await super.runMiddleware({
        ...params,
        onWarning: (warn) => {
          this.logErrorWithOriginalStack(warn, 'warning', 'client')
        },
      })

      result?.waitUntil.catch((error) =>
        this.logErrorWithOriginalStack(error, 'unhandledRejection', 'client')
      )
      return result
    } catch (error) {
      this.logErrorWithOriginalStack(error, undefined, 'client')

      const preflight =
        params.request.method === 'HEAD' &&
        params.request.headers['x-middleware-preflight']
      if (preflight) throw error

      const err = getProperError(error)
      ;(err as any).middleware = true
      const { request, response, parsedUrl } = params
      response.statusCode = 500
      this.renderError(err, request, response, parsedUrl.pathname)
      return null
    }
  }

  async run(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    await this.devReady
    this.setupWebSocketHandler(undefined, req)

    const { basePath } = this.nextConfig
    let originalPathname: string | null = null

    if (basePath && hasBasePath(parsedUrl.pathname || '/', basePath)) {
      // strip basePath before handling dev bundles
      // If replace ends up replacing the full url it'll be `undefined`, meaning we have to default it to `/`
      originalPathname = parsedUrl.pathname
      parsedUrl.pathname = replaceBasePath(parsedUrl.pathname || '/', basePath)
    }

    const { pathname } = parsedUrl

    if (pathname!.startsWith('/_next')) {
      if (await fileExists(pathJoin(this.publicDir, '_next'))) {
        throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT)
      }
    }

    const { finished = false } = await this.hotReloader!.run(
      req.originalRequest,
      res.originalResponse,
      parsedUrl
    )

    if (finished) {
      return
    }

    if (originalPathname) {
      // restore the path before continuing so that custom-routes can accurately determine
      // if they should match against the basePath or not
      parsedUrl.pathname = originalPathname
    }
    try {
      return await super.run(req, res, parsedUrl)
    } catch (error) {
      res.statusCode = 500
      const err = getProperError(error)
      try {
        this.logErrorWithOriginalStack(err).catch(() => {})
        return await this.renderError(err, req, res, pathname!, {
          __NEXT_PAGE: (isError(err) && err.page) || pathname || '',
        })
      } catch (internalErr) {
        console.error(internalErr)
        res.body('Internal Server Error').send()
      }
    }
  }

  private async logErrorWithOriginalStack(
    err?: unknown,
    type?: 'unhandledRejection' | 'uncaughtException' | 'warning',
    stats: 'server' | 'client' = 'server'
  ) {
    let usedOriginalStack = false

    if (isError(err) && err.name && err.stack && err.message) {
      try {
        const frames = parseStack(err.stack!)
        const frame = frames[0]

        if (frame.lineNumber && frame?.file) {
          const compilation =
            stats === 'client'
              ? this.hotReloader?.clientStats?.compilation
              : this.hotReloader?.serverStats?.compilation

          const moduleId = frame.file!.replace(
            /^(webpack-internal:\/\/\/|file:\/\/)/,
            ''
          )

          const source = await getSourceById(
            !!frame.file?.startsWith(sep) || !!frame.file?.startsWith('file:'),
            moduleId,
            compilation
          )

          const originalFrame = await createOriginalStackFrame({
            line: frame.lineNumber!,
            column: frame.column,
            source,
            frame,
            modulePath: moduleId,
            rootDirectory: this.dir,
          })

          if (originalFrame) {
            const { originalCodeFrame, originalStackFrame } = originalFrame
            const { file, lineNumber, column, methodName } = originalStackFrame

            console.error(
              (type === 'warning' ? chalk.yellow('warn') : chalk.red('error')) +
                ' - ' +
                `${file} (${lineNumber}:${column}) @ ${methodName}`
            )
            console.error(
              `${(type === 'warning' ? chalk.yellow : chalk.red)(err.name)}: ${
                err.message
              }`
            )
            console.error(originalCodeFrame)
            usedOriginalStack = true
          }
        }
      } catch (_) {
        // failed to load original stack using source maps
        // this un-actionable by users so we don't show the
        // internal error and only show the provided stack
      }
    }

    if (!usedOriginalStack) {
      if (type === 'warning') {
        Log.warn(err + '')
      } else if (type) {
        Log.error(`${type}:`, err + '')
      } else {
        Log.error(err + '')
      }
    }
  }

  // override production loading of routes-manifest
  protected getCustomRoutes(): CustomRoutes {
    // actual routes will be loaded asynchronously during .prepare()
    return {
      redirects: [],
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
      headers: [],
    }
  }

  private _devCachedPreviewProps: __ApiPreviewProps | undefined
  protected getPreviewProps() {
    if (this._devCachedPreviewProps) {
      return this._devCachedPreviewProps
    }
    return (this._devCachedPreviewProps = {
      previewModeId: crypto.randomBytes(16).toString('hex'),
      previewModeSigningKey: crypto.randomBytes(32).toString('hex'),
      previewModeEncryptionKey: crypto.randomBytes(32).toString('hex'),
    })
  }

  protected getPagesManifest(): undefined {
    return undefined
  }

  protected getMiddleware(): never[] {
    return []
  }

  protected getMiddlewareManifest(): undefined {
    return undefined
  }

  protected getServerComponentManifest() {
    return undefined
  }

  protected async hasMiddleware(
    pathname: string,
    isSSR?: boolean
  ): Promise<boolean> {
    return this.hasPage(isSSR ? pathname : getMiddlewareFilepath(pathname))
  }

  protected async ensureMiddleware(pathname: string, isSSR?: boolean) {
    return this.hotReloader!.ensurePage(
      isSSR ? pathname : getMiddlewareFilepath(pathname)
    )
  }

  generateRoutes() {
    const { fsRoutes, ...otherRoutes } = super.generateRoutes()

    // In development we expose all compiled files for react-error-overlay's line show feature
    // We use unshift so that we're sure the routes is defined before Next's default routes
    fsRoutes.unshift({
      match: route('/_next/development/:path*'),
      type: 'route',
      name: '_next/development catchall',
      fn: async (req, res, params) => {
        const p = pathJoin(this.distDir, ...(params.path || []))
        await this.serveStatic(req, res, p)
        return {
          finished: true,
        }
      },
    })

    fsRoutes.unshift({
      match: route(
        `/_next/${CLIENT_STATIC_FILES_PATH}/${this.buildId}/${DEV_CLIENT_PAGES_MANIFEST}`
      ),
      type: 'route',
      name: `_next/${CLIENT_STATIC_FILES_PATH}/${this.buildId}/${DEV_CLIENT_PAGES_MANIFEST}`,
      fn: async (_req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res
          .body(
            JSON.stringify({
              pages: this.sortedRoutes,
            })
          )
          .send()
        return {
          finished: true,
        }
      },
    })

    fsRoutes.unshift({
      match: route(
        `/_next/${CLIENT_STATIC_FILES_PATH}/${this.buildId}/${DEV_MIDDLEWARE_MANIFEST}`
      ),
      type: 'route',
      name: `_next/${CLIENT_STATIC_FILES_PATH}/${this.buildId}/${DEV_MIDDLEWARE_MANIFEST}`,
      fn: async (_req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res
          .body(
            JSON.stringify(
              this.middleware?.map((middleware) => [
                middleware.page,
                !!middleware.ssr,
              ]) || []
            )
          )
          .send()
        return {
          finished: true,
        }
      },
    })

    fsRoutes.push({
      match: route('/:path*'),
      type: 'route',
      requireBasePath: false,
      name: 'catchall public directory route',
      fn: async (req, res, params, parsedUrl) => {
        const { pathname } = parsedUrl
        if (!pathname) {
          throw new Error('pathname is undefined')
        }

        // Used in development to check public directory paths
        if (await this._beforeCatchAllRender(req, res, params, parsedUrl)) {
          return {
            finished: true,
          }
        }

        return {
          finished: false,
        }
      },
    })

    return { fsRoutes, ...otherRoutes }
  }

  // In development public files are not added to the router but handled as a fallback instead
  protected generatePublicRoutes(): never[] {
    return []
  }

  // In development dynamic routes cannot be known ahead of time
  protected getDynamicRoutes(): never[] {
    return []
  }

  _filterAmpDevelopmentScript(
    html: string,
    event: { line: number; col: number; code: string }
  ): boolean {
    if (event.code !== 'DISALLOWED_SCRIPT_TAG') {
      return true
    }

    const snippetChunks = html.split('\n')

    let snippet
    if (
      !(snippet = html.split('\n')[event.line - 1]) ||
      !(snippet = snippet.substring(event.col))
    ) {
      return true
    }

    snippet = snippet + snippetChunks.slice(event.line).join('\n')
    snippet = snippet.substring(0, snippet.indexOf('</script>'))

    return !snippet.includes('data-amp-development-mode-only')
  }

  protected async getStaticPaths(pathname: string): Promise<{
    staticPaths: string[] | undefined
    fallbackMode: false | 'static' | 'blocking'
  }> {
    // we lazy load the staticPaths to prevent the user
    // from waiting on them for the page to load in dev mode

    const __getStaticPaths = async () => {
      const {
        configFileName,
        publicRuntimeConfig,
        serverRuntimeConfig,
        httpAgentOptions,
      } = this.nextConfig
      const { locales, defaultLocale } = this.nextConfig.i18n || {}

      const paths = await this.getStaticPathsWorker().loadStaticPaths(
        this.distDir,
        pathname,
        !this.renderOpts.dev && this._isLikeServerless,
        {
          configFileName,
          publicRuntimeConfig,
          serverRuntimeConfig,
        },
        httpAgentOptions,
        locales,
        defaultLocale
      )
      return paths
    }
    const { paths: staticPaths, fallback } = (
      await withCoalescedInvoke(__getStaticPaths)(`staticPaths-${pathname}`, [])
    ).value

    return {
      staticPaths,
      fallbackMode:
        fallback === 'blocking'
          ? 'blocking'
          : fallback === true
          ? 'static'
          : false,
    }
  }

  protected async ensureApiPage(pathname: string) {
    return this.hotReloader!.ensurePage(pathname)
  }

  protected async findPageComponents(
    pathname: string,
    query: ParsedUrlQuery = {},
    params: Params | null = null
  ): Promise<FindComponentsResult | null> {
    await this.devReady
    const compilationErr = await this.getCompilationError(pathname)
    if (compilationErr) {
      // Wrap build errors so that they don't get logged again
      throw new WrappedBuildError(compilationErr)
    }
    try {
      await this.hotReloader!.ensurePage(pathname)

      const serverComponents = this.nextConfig.experimental.serverComponents

      // When the new page is compiled, we need to reload the server component
      // manifest.
      if (serverComponents) {
        this.serverComponentManifest = super.getServerComponentManifest()
      }

      return super.findPageComponents(pathname, query, params)
    } catch (err) {
      if ((err as any).code !== 'ENOENT') {
        throw err
      }
      return null
    }
  }

  protected async getFallbackErrorComponents(): Promise<LoadComponentsReturnType | null> {
    await this.hotReloader!.buildFallbackError()
    // Build the error page to ensure the fallback is built too.
    // TODO: See if this can be moved into hotReloader or removed.
    await this.hotReloader!.ensurePage('/_error')
    return await loadDefaultErrorComponents(this.distDir)
  }

  protected setImmutableAssetCacheControl(res: BaseNextResponse): void {
    res.setHeader('Cache-Control', 'no-store, must-revalidate')
  }

  private servePublic(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathParts: string[]
  ): Promise<void> {
    const p = pathJoin(this.publicDir, ...pathParts)
    return this.serveStatic(req, res, p)
  }

  async hasPublicFile(path: string): Promise<boolean> {
    try {
      const info = await fs.promises.stat(pathJoin(this.publicDir, path))
      return info.isFile()
    } catch (_) {
      return false
    }
  }

  async getCompilationError(page: string): Promise<any> {
    const errors = await this.hotReloader!.getCompilationErrors(page)
    if (errors.length === 0) return

    // Return the very first error we found.
    return errors[0]
  }

  protected isServeableUrl(untrustedFileUrl: string): boolean {
    // This method mimics what the version of `send` we use does:
    // 1. decodeURIComponent:
    //    https://github.com/pillarjs/send/blob/0.17.1/index.js#L989
    //    https://github.com/pillarjs/send/blob/0.17.1/index.js#L518-L522
    // 2. resolve:
    //    https://github.com/pillarjs/send/blob/de073ed3237ade9ff71c61673a34474b30e5d45b/index.js#L561

    let decodedUntrustedFilePath: string
    try {
      // (1) Decode the URL so we have the proper file name
      decodedUntrustedFilePath = decodeURIComponent(untrustedFileUrl)
    } catch {
      return false
    }

    // (2) Resolve "up paths" to determine real request
    const untrustedFilePath = pathResolve(decodedUntrustedFilePath)

    // don't allow null bytes anywhere in the file path
    if (untrustedFilePath.indexOf('\0') !== -1) {
      return false
    }

    // During development mode, files can be added while the server is running.
    // Checks for .next/static, .next/server, static and public.
    // Note that in development .next/server is available for error reporting purposes.
    // see `packages/next/server/next-server.ts` for more details.
    if (
      untrustedFilePath.startsWith(pathJoin(this.distDir, 'static') + sep) ||
      untrustedFilePath.startsWith(pathJoin(this.distDir, 'server') + sep) ||
      untrustedFilePath.startsWith(pathJoin(this.dir, 'static') + sep) ||
      untrustedFilePath.startsWith(pathJoin(this.dir, 'public') + sep)
    ) {
      return true
    }

    return false
  }
}

function getMiddlewareFilepath(pathname: string) {
  return pathname.endsWith('/')
    ? `${pathname}_middleware`
    : `${pathname}/_middleware`
}
