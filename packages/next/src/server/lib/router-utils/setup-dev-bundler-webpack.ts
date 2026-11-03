import type { UnwrapPromise } from '../../../lib/coalesced-function'
import type { NextJsHotReloaderInterface } from '../../dev/hot-reloader-types'
import type { SetupOpts } from './dev-bundler-types'

import { getDefineEnv } from '../../../build/define-env'
import { JsConfigPathsPlugin } from '../../../build/webpack/plugins/jsconfig-paths-plugin'
import { generateEncryptionKeyBase64 } from '../../app-render/encryption-utils-server'
import { HMR_MESSAGE_SENT_TO_BROWSER } from '../../dev/hot-reloader-types'
import {
  prepareDevBundler,
  recordDevBundlerTelemetry,
  startDevBundlerWatcher,
} from './setup-dev-bundler-common'

export async function setupDevBundlerWebpack(opts: SetupOpts) {
  const context = await prepareDevBundler(opts)
  const { isSrcDir, distDir, lockfile } = context
  const { nextConfig, dir, resetFetch } = opts
  const HotReloader = process.env.NEXT_RSPACK
    ? (
        require('../../dev/hot-reloader-rspack') as typeof import('../../dev/hot-reloader-rspack')
      ).default
    : (
        require('../../dev/hot-reloader-webpack') as typeof import('../../dev/hot-reloader-webpack')
      ).default
  const hotReloader: NextJsHotReloaderInterface = new HotReloader(opts.dir, {
    isSrcDir,
    appDir: opts.appDir,
    pagesDir: opts.pagesDir,
    distDir,
    config: nextConfig,
    buildId: 'development',
    encryptionKey: await generateEncryptionKeyBase64({
      isBuild: false,
      distDir,
    }),
    telemetry: opts.telemetry,
    rewrites: opts.fsChecker.rewrites,
    previewProps: opts.fsChecker.previewProps,
    resetFetch,
    lockfile,
    onDevServerCleanup: opts.onDevServerCleanup,
    hasVulnerabilityInsight: opts.hasVulnerabilityInsight,
  })

  await hotReloader.start()

  const result = await startDevBundlerWatcher(opts, context, hotReloader, {
    setHmrServerError: hotReloader.setHmrServerError.bind(hotReloader),
    clearHmrServerError: hotReloader.clearHmrServerError.bind(hotReloader),
    async updateConfig({
      envFileChange,
      tsconfigChange,
      clientRouterFiltersChange,
      clientRouterFilters,
    }) {
      let tsconfigResult:
        | UnwrapPromise<
            ReturnType<typeof import('../../../build/load-jsconfig').default>
          >
        | undefined
      if (tsconfigChange) {
        try {
          const loadJsConfig = (
            require('../../../build/load-jsconfig') as typeof import('../../../build/load-jsconfig')
          ).default
          tsconfigResult = await loadJsConfig(dir, nextConfig)
        } catch (_) {
          /* do we want to log if there are syntax errors in tsconfig while editing? */
        }
      }

      hotReloader.activeWebpackConfigs?.forEach((config, idx) => {
        const isClient = idx === 0
        const isNodeServer = idx === 1
        const isEdgeServer = idx === 2
        const hasRewrites =
          opts.fsChecker.rewrites.afterFiles.length > 0 ||
          opts.fsChecker.rewrites.beforeFiles.length > 0 ||
          opts.fsChecker.rewrites.fallback.length > 0

        if (tsconfigChange) {
          config.resolve?.plugins?.forEach((plugin: any) => {
            // look for the JsConfigPathsPlugin and update with
            // the latest paths/baseUrl config
            if (plugin instanceof JsConfigPathsPlugin && tsconfigResult) {
              const { resolvedBaseUrl, jsConfig } = tsconfigResult
              const currentResolvedBaseUrl = plugin.resolvedBaseUrl
              const resolvedUrlIndex = config.resolve?.modules?.findIndex(
                (item) => item === currentResolvedBaseUrl?.baseUrl
              )

              if (resolvedBaseUrl) {
                if (
                  resolvedBaseUrl.baseUrl !== currentResolvedBaseUrl?.baseUrl
                ) {
                  // remove old baseUrl and add new one
                  if (resolvedUrlIndex && resolvedUrlIndex > -1) {
                    config.resolve?.modules?.splice(resolvedUrlIndex, 1)
                  }

                  // If the resolvedBaseUrl is implicit we only remove the previous value.
                  // Only add the baseUrl if it's explicitly set in tsconfig/jsconfig
                  if (!resolvedBaseUrl.isImplicit) {
                    config.resolve?.modules?.push(resolvedBaseUrl.baseUrl)
                  }
                }
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

        if (envFileChange || clientRouterFiltersChange) {
          config.plugins?.forEach((plugin: any) => {
            // we look for the DefinePlugin definitions so we can
            // update them on the active compilers
            if (
              plugin &&
              typeof plugin.definitions === 'object' &&
              plugin.definitions.__NEXT_DEFINE_ENV
            ) {
              const newDefine = getDefineEnv({
                isTurbopack: false,
                clientRouterFilters,
                config: nextConfig,
                dev: true,
                distDir,
                fetchCacheKeyPrefix:
                  opts.nextConfig.experimental.fetchCacheKeyPrefix,
                hasRewrites,
                isClient,
                isEdgeServer,
                isNodeServer,
                middlewareMatchers: undefined,
                projectPath: opts.dir,
                rewrites: opts.fsChecker.rewrites,
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
    },
    onRoutesChanged(routes, previousRoutes) {
      const addedRoutes = routes.filter(
        (route) => !previousRoutes.includes(route)
      )
      const removedRoutes = previousRoutes.filter(
        (route) => !routes.includes(route)
      )

      // emit the change so clients fetch the update
      hotReloader.send({
        type: HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE,
        data: [
          {
            devPagesManifest: true,
          },
        ],
      })

      addedRoutes.forEach((route) => {
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE,
          data: [route],
        })
      })

      removedRoutes.forEach((route) => {
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE,
          data: [route],
        })
      })
    },
  })

  await recordDevBundlerTelemetry(opts, isSrcDir, false)
  return result
}
