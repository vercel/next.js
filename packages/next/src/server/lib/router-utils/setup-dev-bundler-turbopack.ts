import type { DevBundler, SetupOpts } from './dev-bundler-types'
import { createDefineEnv } from '../../../build/swc'
import {
  prepareDevBundler,
  recordDevBundlerTelemetry,
  startDevBundlerWatcher,
} from './setup-dev-bundler-common'

export async function setupDevBundlerTurbopack(
  opts: SetupOpts
): Promise<DevBundler> {
  const context = await prepareDevBundler(opts)
  const { createHotReloaderTurbopack } =
    require('../../dev/hot-reloader-turbopack') as typeof import('../../dev/hot-reloader-turbopack')
  const hotReloader = await createHotReloaderTurbopack(
    { ...opts, isSrcDir: context.isSrcDir },
    context.serverFields,
    context.distDir,
    opts.resetFetch,
    context.lockfile,
    opts.serverFastRefresh
  )

  // The Turbopack factory initializes the project and owns module HMR, route
  // notifications, diagnostics, and cleanup. Its start() method is a no-op.
  const result = await startDevBundlerWatcher(opts, context, hotReloader, {
    normalizeAppPath: (appPath) => appPath.replace(/%5F/g, '_'),
    async updateConfig({ clientRouterFilters }) {
      const { rewrites } = opts.fsChecker
      const hasRewrites =
        rewrites.afterFiles.length > 0 ||
        rewrites.beforeFiles.length > 0 ||
        rewrites.fallback.length > 0

      // Keep refreshing definitions for tsconfig changes too. Turbopack handles
      // resolution internally; the watcher preserves the existing refresh flow.
      await hotReloader.turbopackProject.update({
        defineEnv: createDefineEnv({
          isTurbopack: true,
          clientRouterFilters,
          config: opts.nextConfig,
          dev: true,
          distDir: context.distDir,
          fetchCacheKeyPrefix: opts.nextConfig.experimental.fetchCacheKeyPrefix,
          hasRewrites,
          // TODO: Implement
          middlewareMatchers: undefined,
          projectPath: opts.dir,
          rewrites,
        }),
      })
    },
  })

  await recordDevBundlerTelemetry(opts, context.isSrcDir, true)
  return result
}
