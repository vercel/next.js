import { Telemetry } from '../../telemetry/storage'
import type { Server as HTTPServer } from 'http'
import {
  FindComponentsResult,
  FindPageComponentsOptions,
  WrappedBuildError,
} from '../base-server'
import { deserializeErr } from '../render'
import DevServer from './next-dev-server'
import type {
  EnsurePageOptions,
  EnvChangeOptions,
  OriginalFrameOptions,
  OriginalFrameResult,
} from './next-dev-server'
import { NodeNextRequest, NodeNextResponse } from '../base-http/node'
import { UrlWithParsedQuery } from 'url'
import {
  createOriginalStackFrame,
  getSourceById,
} from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import HotReloader from './hot-reloader'
import { sep } from 'path'
import * as Log from '../../build/output/log'
import { getDefineEnv } from '../../build/webpack-config'

export default class WebpackDevServer extends DevServer {
  private hotReloader?: HotReloader
  private addedUpgradeListener = false

  protected async prepareInner({
    telemetry,
  }: {
    telemetry: Telemetry
  }): Promise<void> {
    // router worker does not start webpack compilers
    if (!this.isRenderWorker) {
      const { rewrites } = this.customRoutes
      this.hotReloader = new HotReloader(this.dir, {
        pagesDir: this.pagesDir,
        distDir: this.distDir,
        config: this.nextConfig,
        previewProps: this.getPrerenderManifest().preview,
        buildId: this.buildId,
        rewrites,
        appDir: this.appDir,
        telemetry,
      })
    }
    await this.hotReloader?.start()
  }

  protected async close(): Promise<void> {
    await super.close()
    if (this.hotReloader) {
      await this.hotReloader.stop()
    }
  }

  protected setupWebSocketHandler(server?: HTTPServer, _req?: NodeNextRequest) {
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

        server.on('upgrade', async (req, socket, head) => {
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
            if (!this.isRenderWorker) {
              this.hotReloader?.onHMR(req, socket, head)
            }
          } else {
            this.handleUpgrade(req as any as NodeNextRequest, socket, head)
          }
        })
      }
    }
  }

  protected async findPageComponents(
    options: FindPageComponentsOptions
  ): Promise<FindComponentsResult | null> {
    await this.devReady
    const compilationErr = await this.getCompilationError(options.pathname)
    if (compilationErr) {
      // Wrap build errors so that they don't get logged again
      throw new WrappedBuildError(compilationErr)
    }
    return super.findPageComponents(options)
  }

  async getCompilationError(page: string): Promise<any> {
    if (this.isRenderWorker) {
      const err = await this.invokeIpcMethod('getCompilationError', [page])
      return deserializeErr(err)
    }
    const errors = await this.hotReloader?.getCompilationErrors(page)
    if (!errors) return

    // Return the very first error we found.
    return errors[0]
  }

  protected async handleEnvChange({
    tsconfigChange,
    tsconfigResult,
    envChange,
    clientRouterFilterChange,
    clientRouterFilters,
  }: EnvChangeOptions) {
    this.hotReloader?.activeConfigs?.forEach((config, idx) => {
      const isClient = idx === 0
      const isNodeServer = idx === 1
      const isEdgeServer = idx === 2
      const hasRewrites =
        this.customRoutes.rewrites.afterFiles.length > 0 ||
        this.customRoutes.rewrites.beforeFiles.length > 0 ||
        this.customRoutes.rewrites.fallback.length > 0

      if (tsconfigChange) {
        config.resolve?.plugins?.forEach((plugin: any) => {
          // look for the JsConfigPathsPlugin and update with
          // the latest paths/baseUrl config
          if (plugin && plugin.jsConfigPlugin && tsconfigResult) {
            const { resolvedBaseUrl, jsConfig } = tsconfigResult
            const currentResolvedBaseUrl = plugin.resolvedBaseUrl
            const resolvedUrlIndex = config.resolve?.modules?.findIndex(
              (item) => item === currentResolvedBaseUrl
            )

            if (resolvedBaseUrl && resolvedBaseUrl !== currentResolvedBaseUrl) {
              // remove old baseUrl and add new one
              if (resolvedUrlIndex && resolvedUrlIndex > -1) {
                config.resolve?.modules?.splice(resolvedUrlIndex, 1)
              }
              config.resolve?.modules?.push(resolvedBaseUrl)
            }

            if (jsConfig?.compilerOptions?.paths && resolvedBaseUrl) {
              Object.keys(plugin.paths).forEach((key) => {
                delete plugin.paths[key]
              })
              Object.assign(plugin.paths, jsConfig.compilerOptions.paths)
              plugin.resolvedBaseUrl = resolvedBaseUrl
            }
          }
        })
      }

      if (envChange || clientRouterFilterChange) {
        config.plugins?.forEach((plugin: any) => {
          // we look for the DefinePlugin definitions so we can
          // update them on the active compilers
          if (
            plugin &&
            typeof plugin.definitions === 'object' &&
            plugin.definitions.__NEXT_DEFINE_ENV
          ) {
            const newDefine = getDefineEnv({
              dev: true,
              config: this.nextConfig,
              distDir: this.distDir,
              isClient,
              hasRewrites,
              isNodeServer,
              isEdgeServer,
              clientRouterFilters,
            })

            Object.keys(plugin.definitions).forEach((key) => {
              if (!(key in newDefine)) {
                delete plugin.definitions[key]
              }
            })
            Object.assign(plugin.definitions, newDefine)
          }
        })
      }
    })
    this.hotReloader?.invalidate({
      reloadAfterInvalidation: envChange,
    })
  }

  protected handleServerError(error: Error | null | undefined) {
    if (error) {
      this.hotReloader?.setHmrServerError(error)
    } else {
      this.hotReloader?.clearHmrServerError()
    }
  }

  protected handleRoutesUpdate() {
    // emit the change so clients fetch the update
    this.hotReloader?.send('devPagesManifestUpdate', {
      devPagesManifest: true,
    })
  }

  protected async preRun(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    if (this.hotReloader) {
      const { finished = false } = await this.hotReloader.run(
        req.originalRequest,
        res.originalResponse,
        parsedUrl
      )

      if (finished) return true
    }
    return false
  }

  protected async getOriginalFrame({
    frame,
    source: src,
    error,
  }: OriginalFrameOptions): Promise<OriginalFrameResult | null> {
    if (frame?.lineNumber && frame?.file) {
      const moduleId = frame.file!.replace(
        /^(webpack-internal:\/\/\/|file:\/\/)/,
        ''
      )
      const modulePath = frame.file.replace(
        /^(webpack-internal:\/\/\/|file:\/\/)(\(.*\)\/)?/,
        ''
      )

      const isEdgeCompiler = src === 'edge-server'
      const compilation = (
        isEdgeCompiler
          ? this.hotReloader?.edgeServerStats?.compilation
          : this.hotReloader?.serverStats?.compilation
      )!

      const source = await getSourceById(
        !!frame.file?.startsWith(sep) || !!frame.file?.startsWith('file:'),
        moduleId,
        compilation
      )

      const originalFrame = await createOriginalStackFrame({
        line: frame.lineNumber,
        column: frame.column,
        source,
        frame,
        moduleId,
        modulePath,
        rootDirectory: this.dir,
        errorMessage: error.message,
        serverCompilation: isEdgeCompiler
          ? undefined
          : this.hotReloader?.serverStats?.compilation,
        edgeCompilation: isEdgeCompiler
          ? this.hotReloader?.edgeServerStats?.compilation
          : undefined,
      }).catch(() => null)

      return originalFrame
    }
    return null
  }

  protected async ensurePageImpl(opts: EnsurePageOptions) {
    return this.hotReloader?.ensurePage(opts)
  }

  protected async ensureFallbackErrorImpl(): Promise<void> {
    await this.hotReloader?.buildFallbackError()
    // Build the error page to ensure the fallback is built too.
    // TODO: See if this can be moved into hotReloader or removed.
    await this.ensurePage({ page: '/_error', clientOnly: false })
  }
}
