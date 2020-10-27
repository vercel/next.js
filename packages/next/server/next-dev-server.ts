import { ReactDevOverlay } from '@next/react-dev-overlay/lib/client'
import crypto from 'crypto'
import fs from 'fs'
import { IncomingMessage, ServerResponse } from 'http'
import Worker from 'jest-worker'
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import findUp from 'next/dist/compiled/find-up'
import { join as pathJoin, relative, resolve as pathResolve, sep } from 'path'
import React from 'react'
import { UrlWithParsedQuery } from 'url'
import Watchpack from 'watchpack'
import { ampValidation } from '../build/output/index'
import * as Log from '../build/output/log'
import { PUBLIC_DIR_MIDDLEWARE_CONFLICT } from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { findPagesDir } from '../lib/find-pages-dir'
import loadCustomRoutes, { CustomRoutes } from '../lib/load-custom-routes'
import { verifyTypeScriptSetup } from '../lib/verifyTypeScriptSetup'
import {
  PHASE_DEVELOPMENT_SERVER,
  CLIENT_STATIC_FILES_PATH,
  DEV_CLIENT_PAGES_MANIFEST,
} from '../next-server/lib/constants'
import {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../next-server/lib/router/utils'
import { __ApiPreviewProps } from '../next-server/server/api-utils'
import Server, { ServerConstructor } from '../next-server/server/next-server'
import { normalizePagePath } from '../next-server/server/normalize-page-path'
import Router, { Params, route } from '../next-server/server/router'
import { eventCliSession } from '../telemetry/events'
import { Telemetry } from '../telemetry/storage'
import HotReloader from './hot-reloader'
import { findPageFile } from './lib/find-page-file'
import { getNodeOptionsWithoutInspect } from './lib/utils'
import { withCoalescedInvoke } from '../lib/coalesced-function'

if (typeof React.Suspense === 'undefined') {
  throw new Error(
    `The version of React you are using is lower than the minimum required version needed for Next.js. Please upgrade "react" and "react-dom": "npm install react react-dom" https://err.sh/vercel/next.js/invalid-react-version`
  )
}

export default class DevServer extends Server {
  private devReady: Promise<void>
  private setDevReady?: Function
  private webpackWatcher?: Watchpack | null
  private hotReloader?: HotReloader
  private isCustomServer: boolean
  protected sortedRoutes?: string[]

  protected staticPathsWorker: import('jest-worker').default & {
    loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
  }

  constructor(options: ServerConstructor & { isNextDevCommand?: boolean }) {
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
        `The static directory has been deprecated in favor of the public directory. https://err.sh/vercel/next.js/static-dir-deprecated`
      )
    }
    this.isCustomServer = !options.isNextDevCommand
    this.pagesDir = findPagesDir(this.dir)
    this.staticPathsWorker = new Worker(
      require.resolve('./static-paths-worker'),
      {
        maxRetries: 0,
        numWorkers: this.nextConfig.experimental.cpus,
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
  }

  protected currentPhase(): string {
    return PHASE_DEVELOPMENT_SERVER
  }

  protected readBuildId(): string {
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

            await this.render(req, res, page, mergedQuery, parsedUrl)
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

      wp.on('aggregated', () => {
        const routedPages = []
        const knownFiles = wp.getTimeInfoEntries()
        for (const [fileName, { accuracy }] of knownFiles) {
          if (accuracy === undefined || !regexPageExtension.test(fileName)) {
            continue
          }

          let pageName =
            '/' + relative(pagesDir!, fileName).replace(/\\+/g, '/')
          pageName = pageName.replace(regexPageExtension, '')
          pageName = pageName.replace(/\/index$/, '') || '/'

          routedPages.push(pageName)
        }

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
    await verifyTypeScriptSetup(this.dir, this.pagesDir!, false)

    this.customRoutes = await loadCustomRoutes(this.nextConfig)

    // reload router
    const { redirects, rewrites, headers } = this.customRoutes
    if (redirects.length || rewrites.length || headers.length) {
      this.router = new Router(this.generateRoutes())
    }

    this.hotReloader = new HotReloader(this.dir, {
      pagesDir: this.pagesDir!,
      config: this.nextConfig,
      previewProps: this.getPreviewProps(),
      buildId: this.buildId,
      rewrites: this.customRoutes.rewrites,
    })
    await super.prepare()
    await this.addExportPathMapRoutes()
    await this.hotReloader.start()
    await this.startWatcher()
    this.setDevReady!()

    const telemetry = new Telemetry({ distDir: this.distDir })
    telemetry.record(
      eventCliSession(PHASE_DEVELOPMENT_SERVER, this.distDir, {
        cliCommand: 'dev',
        isSrcDir: relative(this.dir, this.pagesDir!).startsWith('src'),
        hasNowJson: !!(await findUp('now.json', { cwd: this.dir })),
        isCustomServer: this.isCustomServer,
      })
    )
  }

  protected async close(): Promise<void> {
    await this.stopWatcher()
    await this.staticPathsWorker.end()
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
    req: IncomingMessage,
    res: ServerResponse,
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
      const err: Error & { code?: string } = new Error('failed to decode param')
      err.code = 'DECODE_FAILED'
      throw err
    }

    if (await this.hasPublicFile(decodedPath)) {
      if (await this.hasPage(pathname!)) {
        const err = new Error(
          `A conflicting public file and page file was found for path ${pathname} https://err.sh/vercel/next.js/conflicting-public-file-page`
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

  async run(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    await this.devReady

    const { basePath } = this.nextConfig
    let originalPathname: string | null = null

    if (basePath && parsedUrl.pathname?.startsWith(basePath)) {
      // strip basePath before handling dev bundles
      // If replace ends up replacing the full url it'll be `undefined`, meaning we have to default it to `/`
      originalPathname = parsedUrl.pathname
      parsedUrl.pathname = parsedUrl.pathname!.slice(basePath.length) || '/'
    }

    const { pathname } = parsedUrl

    if (pathname!.startsWith('/_next')) {
      if (await fileExists(pathJoin(this.publicDir, '_next'))) {
        throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT)
      }
    }

    const { finished = false } = await this.hotReloader!.run(
      req,
      res,
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

    return super.run(req, res, parsedUrl)
  }

  // override production loading of routes-manifest
  protected getCustomRoutes(): CustomRoutes {
    // actual routes will be loaded asynchronously during .prepare()
    return { redirects: [], rewrites: [], headers: [] }
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
        res.end(
          JSON.stringify({
            pages: this.sortedRoutes,
          })
        )
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

  protected async getStaticPaths(
    pathname: string
  ): Promise<{
    staticPaths: string[] | undefined
    fallbackMode: false | 'static' | 'blocking'
  }> {
    // we lazy load the staticPaths to prevent the user
    // from waiting on them for the page to load in dev mode

    const __getStaticPaths = async () => {
      const { publicRuntimeConfig, serverRuntimeConfig } = this.nextConfig
      const { locales, defaultLocale } = this.nextConfig.i18n || {}

      const paths = await this.staticPathsWorker.loadStaticPaths(
        this.distDir,
        pathname,
        !this.renderOpts.dev && this._isLikeServerless,
        {
          publicRuntimeConfig,
          serverRuntimeConfig,
        },
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

  async renderToHTML(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: { [key: string]: string }
  ): Promise<string | null> {
    await this.devReady
    const compilationErr = await this.getCompilationError(pathname)
    if (compilationErr) {
      res.statusCode = 500
      return this.renderErrorToHTML(compilationErr, req, res, pathname, query)
    }

    // In dev mode we use on demand entries to compile the page before rendering
    try {
      await this.hotReloader!.ensurePage(pathname).catch(async (err: Error) => {
        if ((err as any).code !== 'ENOENT') {
          throw err
        }

        for (const dynamicRoute of this.dynamicRoutes || []) {
          const params = dynamicRoute.match(pathname)
          if (!params) {
            continue
          }

          return this.hotReloader!.ensurePage(dynamicRoute.page)
        }
        throw err
      })
    } catch (err) {
      if (err.code === 'ENOENT') {
        try {
          await this.hotReloader!.ensurePage('/404')
        } catch (hotReloaderError) {
          if (hotReloaderError.code !== 'ENOENT') {
            throw hotReloaderError
          }
        }

        res.statusCode = 404
        return this.renderErrorToHTML(null, req, res, pathname, query)
      }
      if (!this.quiet) console.error(err)
    }
    const html = await super.renderToHTML(req, res, pathname, query)
    return html
  }

  async renderErrorToHTML(
    err: Error | null,
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: { [key: string]: string }
  ): Promise<string | null> {
    await this.devReady
    if (res.statusCode === 404 && (await this.hasPage('/404'))) {
      await this.hotReloader!.ensurePage('/404')
    } else {
      await this.hotReloader!.ensurePage('/_error')
    }

    const compilationErr = await this.getCompilationError(pathname)
    if (compilationErr) {
      res.statusCode = 500
      return super.renderErrorToHTML(compilationErr, req, res, pathname, query)
    }

    if (!err && res.statusCode === 500) {
      err = new Error(
        'An undefined error was thrown sometime during render... ' +
          'See https://err.sh/vercel/next.js/threw-undefined'
      )
    }

    try {
      const out = await super.renderErrorToHTML(err, req, res, pathname, query)
      return out
    } catch (err2) {
      if (!this.quiet) Log.error(err2)
      res.statusCode = 500
      return super.renderErrorToHTML(err2, req, res, pathname, query)
    }
  }

  sendHTML(
    req: IncomingMessage,
    res: ServerResponse,
    html: string
  ): Promise<void> {
    // In dev, we should not cache pages for any reason.
    res.setHeader('Cache-Control', 'no-store, must-revalidate')
    return super.sendHTML(req, res, html)
  }

  protected setImmutableAssetCacheControl(res: ServerResponse): void {
    res.setHeader('Cache-Control', 'no-store, must-revalidate')
  }

  private servePublic(
    req: IncomingMessage,
    res: ServerResponse,
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
    // see `packages/next/next-server/server/next-server.ts` for more details.
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
