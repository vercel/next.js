import type { CustomRoutes } from '../../lib/load-custom-routes'
import type { FindComponentsResult } from '../next-server'
import type { LoadComponentsReturnType } from '../load-components'
import type { Options as ServerOptions } from '../next-server'
import type { Params } from '../../shared/lib/router/utils/route-matcher'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'
import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { MiddlewareRoutingItem } from '../base-server'
import type { FunctionComponent } from 'react'
import type { RouteMatch } from '../future/route-matches/route-match'

import { join as pathJoin } from 'path'
import { ampValidation } from '../../build/output'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../lib/constants'
import { findPagesDir } from '../../lib/find-pages-dir'
import {
  PHASE_DEVELOPMENT_SERVER,
  PAGES_MANIFEST,
  APP_PATHS_MANIFEST,
} from '../../shared/lib/constants'
import Server, { WrappedBuildError } from '../next-server'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { Telemetry } from '../../telemetry/storage'
import { setGlobal } from '../../trace'
import { findPageFile } from '../lib/find-page-file'
import { loadDefaultErrorComponents } from '../load-components'
import isError, { getProperError } from '../../lib/is-error'
import { NodeNextResponse, NodeNextRequest } from '../base-http/node'
import { isMiddlewareFile } from '../../build/utils'
import { formatServerError } from '../../lib/format-server-error'
import {
  DevRouteMatcherManager,
  RouteEnsurer,
} from '../future/route-matcher-managers/dev-route-matcher-manager'
import { DevPagesRouteMatcherProvider } from '../future/route-matcher-providers/dev/dev-pages-route-matcher-provider'
import { DevPagesAPIRouteMatcherProvider } from '../future/route-matcher-providers/dev/dev-pages-api-route-matcher-provider'
import { DevAppPageRouteMatcherProvider } from '../future/route-matcher-providers/dev/dev-app-page-route-matcher-provider'
import { DevAppRouteRouteMatcherProvider } from '../future/route-matcher-providers/dev/dev-app-route-route-matcher-provider'
import { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'
import { NodeManifestLoader } from '../future/route-matcher-providers/helpers/manifest-loaders/node-manifest-loader'
import { CachedFileReader } from '../future/route-matcher-providers/dev/helpers/file-reader/cached-file-reader'
import { DefaultFileReader } from '../future/route-matcher-providers/dev/helpers/file-reader/default-file-reader'
import { NextBuildContext } from '../../build/build-context'
import { NextUrlWithParsedQuery } from '../request-meta'
import { errorToJSON } from '../render'
import { getMiddlewareRouteMatcher } from '../../shared/lib/router/utils/middleware-route-matcher'
import {
  deserializeErr,
  invokeIpcMethod,
} from '../lib/server-ipc/request-utils'

// Load ReactDevOverlay only when needed
let ReactDevOverlayImpl: FunctionComponent
const ReactDevOverlay = (props: any) => {
  if (ReactDevOverlayImpl === undefined) {
    ReactDevOverlayImpl =
      require('next/dist/compiled/@next/react-dev-overlay/dist/client').ReactDevOverlay
  }
  return ReactDevOverlayImpl(props)
}

export interface Options extends ServerOptions {
  /**
   * Tells of Next.js is running from the `next dev` command
   */
  isNextDevCommand?: boolean
}

export default class DevServer extends Server {
  private devReady: Promise<void>
  private setDevReady?: Function
  protected sortedRoutes?: string[]
  private pagesDir?: string
  private appDir?: string
  private actualInstrumentationHookFile?: string
  private middleware?: MiddlewareRoutingItem
  private originalFetch: typeof fetch

  constructor(options: Options) {
    try {
      // Increase the number of stack frames on the server
      Error.stackTraceLimit = 50
    } catch {}
    super({ ...options, dev: true })
    this.originalFetch = global.fetch
    this.renderOpts.dev = true
    this.renderOpts.appDirDevErrorLogger = (err: any) =>
      this.logErrorWithOriginalStack(err, 'app-dir')
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
      const AmpHtmlValidator =
        require('next/dist/compiled/amphtml-validator') as typeof import('next/dist/compiled/amphtml-validator')
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

    const { pagesDir, appDir } = findPagesDir(
      this.dir,
      !!this.nextConfig.experimental.appDir
    )
    this.pagesDir = pagesDir
    this.appDir = appDir
  }

  protected getRoutes() {
    const { pagesDir, appDir } = findPagesDir(
      this.dir,
      !!this.nextConfig.experimental.appDir
    )

    const ensurer: RouteEnsurer = {
      ensure: async (match) => {
        await this.ensurePage({
          match,
          page: match.definition.page,
          clientOnly: false,
        })
      },
    }

    const routes = super.getRoutes()
    const matchers = new DevRouteMatcherManager(
      routes.matchers,
      ensurer,
      this.dir
    )
    const extensions = this.nextConfig.pageExtensions
    const fileReader = new CachedFileReader(new DefaultFileReader())

    // If the pages directory is available, then configure those matchers.
    if (pagesDir) {
      matchers.push(
        new DevPagesRouteMatcherProvider(
          pagesDir,
          extensions,
          fileReader,
          this.localeNormalizer
        )
      )
      matchers.push(
        new DevPagesAPIRouteMatcherProvider(
          pagesDir,
          extensions,
          fileReader,
          this.localeNormalizer
        )
      )
    }

    if (appDir) {
      matchers.push(
        new DevAppPageRouteMatcherProvider(appDir, extensions, fileReader)
      )
      matchers.push(
        new DevAppRouteRouteMatcherProvider(appDir, extensions, fileReader)
      )
    }

    return { matchers }
  }

  protected getBuildId(): string {
    return 'development'
  }

  protected async prepareImpl(): Promise<void> {
    setGlobal('distDir', this.distDir)
    setGlobal('phase', PHASE_DEVELOPMENT_SERVER)

    const telemetry = new Telemetry({ distDir: this.distDir })

    await super.prepareImpl()
    await this.runInstrumentationHookIfAvailable()
    await this.matchers.reload()
    this.setDevReady!()

    // This is required by the tracing subsystem.
    setGlobal('appDir', this.appDir)
    setGlobal('pagesDir', this.pagesDir)
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

  protected async close(): Promise<void> {}

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

    if (isMiddlewareFile(normalizedPath)) {
      return findPageFile(
        this.dir,
        normalizedPath,
        this.nextConfig.pageExtensions,
        false
      ).then(Boolean)
    }

    let appFile: string | null = null
    let pagesFile: string | null = null

    if (this.appDir) {
      appFile = await findPageFile(
        this.appDir,
        normalizedPath + '/page',
        this.nextConfig.pageExtensions,
        true
      )
    }

    if (this.pagesDir) {
      pagesFile = await findPageFile(
        this.pagesDir,
        normalizedPath,
        this.nextConfig.pageExtensions,
        false
      )
    }
    if (appFile && pagesFile) {
      return false
    }

    return Boolean(appFile || pagesFile)
  }

  public async handleRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    await this.devReady
    return await super.handleRequest(req, res, parsedUrl)
  }

  async run(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    await this.devReady

    const { basePath } = this.nextConfig
    let originalPathname: string | null = null

    // TODO: see if we can remove this in the future
    if (basePath && pathHasPrefix(parsedUrl.pathname || '/', basePath)) {
      // strip basePath before handling dev bundles
      // If replace ends up replacing the full url it'll be `undefined`, meaning we have to default it to `/`
      originalPathname = parsedUrl.pathname
      parsedUrl.pathname = removePathPrefix(parsedUrl.pathname || '/', basePath)
    }

    const { pathname } = parsedUrl

    if (originalPathname) {
      // restore the path before continuing so that custom-routes can accurately determine
      // if they should match against the basePath or not
      parsedUrl.pathname = originalPathname
    }
    try {
      return await super.run(req, res, parsedUrl)
    } catch (error) {
      const err = getProperError(error)
      formatServerError(err)
      this.logErrorWithOriginalStack(err).catch(() => {})
      if (!res.sent) {
        res.statusCode = 500
        try {
          return await this.renderError(err, req, res, pathname!, {
            __NEXT_PAGE: (isError(err) && err.page) || pathname || '',
          })
        } catch (internalErr) {
          console.error(internalErr)
          res.body('Internal Server Error').send()
        }
      }
    }
  }

  protected async logErrorWithOriginalStack(
    err?: unknown,
    type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
  ): Promise<void> {
    if (this.isRenderWorker) {
      await invokeIpcMethod({
        fetchHostname: this.fetchHostname,
        method: 'logErrorWithOriginalStack',
        args: [errorToJSON(err as Error), type],
        ipcPort: process.env.__NEXT_PRIVATE_ROUTER_IPC_PORT,
        ipcKey: process.env.__NEXT_PRIVATE_ROUTER_IPC_KEY,
      })
      return
    }
    throw new Error(
      'Invariant logErrorWithOriginalStack called outside render worker'
    )
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

  protected getPagesManifest(): PagesManifest | undefined {
    return (
      NodeManifestLoader.require(
        pathJoin(this.serverDistDir, PAGES_MANIFEST)
      ) ?? undefined
    )
  }

  protected getAppPathsManifest(): PagesManifest | undefined {
    if (!this.hasAppDir) return undefined

    return (
      NodeManifestLoader.require(
        pathJoin(this.serverDistDir, APP_PATHS_MANIFEST)
      ) ?? undefined
    )
  }

  protected getMiddleware() {
    // We need to populate the match
    // field as it isn't serializable
    if (this.middleware?.match === null) {
      this.middleware.match = getMiddlewareRouteMatcher(
        this.middleware.matchers || []
      )
    }
    return this.middleware
  }

  protected getNextFontManifest() {
    return undefined
  }

  private async runInstrumentationHookIfAvailable() {
    if (
      this.actualInstrumentationHookFile &&
      (await this.ensurePage({
        page: this.actualInstrumentationHookFile!,
        clientOnly: false,
      })
        .then(() => true)
        .catch(() => false))
    ) {
      NextBuildContext!.hasInstrumentationHook = true

      try {
        const instrumentationHook = await require(pathJoin(
          this.distDir,
          'server',
          INSTRUMENTATION_HOOK_FILENAME
        ))
        await instrumentationHook.register()
      } catch (err: any) {
        err.message = `An error occurred while loading instrumentation hook: ${err.message}`
        throw err
      }
    }
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

  private restorePatchedGlobals(): void {
    global.fetch = this.originalFetch
  }

  protected async ensurePage(opts: {
    page: string
    clientOnly: boolean
    appPaths?: string[] | null
    match?: RouteMatch
  }): Promise<void> {
    if (this.isRenderWorker) {
      await invokeIpcMethod({
        fetchHostname: this.fetchHostname,
        method: 'ensurePage',
        args: [opts],
        ipcPort: process.env.__NEXT_PRIVATE_ROUTER_IPC_PORT,
        ipcKey: process.env.__NEXT_PRIVATE_ROUTER_IPC_KEY,
      })
      return
    }
    throw new Error('Invariant ensurePage called outside render worker')
  }

  protected async findPageComponents({
    pathname,
    query,
    params,
    isAppPath,
    appPaths = null,
  }: {
    pathname: string
    query: ParsedUrlQuery
    params: Params
    isAppPath: boolean
    appPaths?: string[] | null
  }): Promise<FindComponentsResult | null> {
    await this.devReady
    const compilationErr = await this.getCompilationError(pathname)
    if (compilationErr) {
      // Wrap build errors so that they don't get logged again
      throw new WrappedBuildError(compilationErr)
    }
    try {
      await this.ensurePage({
        page: pathname,
        appPaths,
        clientOnly: false,
      })

      this.nextFontManifest = super.getNextFontManifest()
      // before we re-evaluate a route module, we want to restore globals that might
      // have been patched previously to their original state so that we don't
      // patch on top of the previous patch, which would keep the context of the previous
      // patched global in memory, creating a memory leak.
      this.restorePatchedGlobals()

      return await super.findPageComponents({
        pathname,
        query,
        params,
        isAppPath,
      })
    } catch (err) {
      if ((err as any).code !== 'ENOENT') {
        throw err
      }
      return null
    }
  }

  protected async getFallbackErrorComponents(): Promise<LoadComponentsReturnType | null> {
    if (this.isRenderWorker) {
      await invokeIpcMethod({
        fetchHostname: this.fetchHostname,
        method: 'getFallbackErrorComponents',
        args: [],
        ipcPort: process.env.__NEXT_PRIVATE_ROUTER_IPC_PORT,
        ipcKey: process.env.__NEXT_PRIVATE_ROUTER_IPC_KEY,
      })
      return await loadDefaultErrorComponents(this.distDir)
    }
    throw new Error(
      `Invariant getFallbackErrorComponents called outside render worker`
    )
  }

  async getCompilationError(page: string): Promise<any> {
    if (this.isRenderWorker) {
      const err = await invokeIpcMethod({
        fetchHostname: this.fetchHostname,
        method: 'getCompilationError',
        args: [page],
        ipcPort: process.env.__NEXT_PRIVATE_ROUTER_IPC_PORT,
        ipcKey: process.env.__NEXT_PRIVATE_ROUTER_IPC_KEY,
      })
      return deserializeErr(err)
    }
    throw new Error(
      'Invariant getCompilationError called outside render worker'
    )
  }
}
