import { relative, isAbsolute, sep } from 'path'
import type { BrowserFixtureHost } from '../../experimental/testing/contracts'
import { createDefineEnv, getBindingsSync } from './index'
import type { NextConfigComplete } from '../../server/config-shared'
import type { ProjectOptions } from './types'
import { generateEncryptionKeyBase64 } from '../../server/app-render/encryption-utils-server'
import { getSupportedBrowsers } from '../get-supported-browsers'
import { normalizePath } from '../../lib/normalize-path'
import { seedTurbopackCacheIfNeeded } from '../../lib/turbopack-cache-seed'
import { isFileSystemCacheEnabledForDev } from '../../shared/lib/turbopack/utils'

/** Shared by next dev and the explicit App RSC test compiler consumer. */
export async function createDevTurbopackProject({
  projectPath,
  nextConfig,
  distDir,
  fsChecker,
  serverFastRefresh,
  browserFixtureHost,
}: {
  projectPath: string
  nextConfig: NextConfigComplete
  distDir: string
  fsChecker: {
    rewrites: Parameters<typeof createDefineEnv>[0]['rewrites']
    previewProps: ProjectOptions['previewProps']
  }
  serverFastRefresh?: boolean
  browserFixtureHost?: BrowserFixtureHost
}) {
  const dev = true
  const buildId = 'development'
  const hasRewrites =
    fsChecker.rewrites.afterFiles.length > 0 ||
    fsChecker.rewrites.beforeFiles.length > 0 ||
    fsChecker.rewrites.fallback.length > 0
  const encryptionKey = await generateEncryptionKeyBase64({
    isBuild: false,
    distDir,
  })

  // TODO: Implement
  let clientRouterFilters: any
  if (nextConfig.experimental.clientRouterFilter) {
    // TODO this need to be set correctly for filesystem cache to work
  }

  const supportedBrowsers = getSupportedBrowsers(projectPath, dev)
  const currentNodeJsVersion = process.versions.node

  const rootPath =
    nextConfig.turbopack?.root ||
    nextConfig.outputFileTracingRoot ||
    projectPath

  if (nextConfig.experimental.turbopackSeedCacheFromWorktree) {
    seedTurbopackCacheIfNeeded({
      projectDir: projectPath,
      distDir,
    })
  }

  const project = await getBindingsSync().turbo.createProject(
    {
      rootPath,
      browserFixtureHost: browserFixtureHost
        ? JSON.stringify({
            routePrefix: browserFixtureHost.routePrefix,
            fixtures: browserFixtureHost.fixtures.map((fixture) => {
              const module = relative(projectPath, fixture.module)
              if (
                !isAbsolute(fixture.module) ||
                !module ||
                isAbsolute(module) ||
                module === '..' ||
                module.startsWith(`..${sep}`)
              ) {
                throw new Error(
                  'Browser fixture modules must be contained in the application project'
                )
              }
              return { ...fixture, module: module.split(sep).join('/') }
            }),
          })
        : undefined,
      projectPath: normalizePath(relative(rootPath, projectPath) || '.'),
      distDir,
      nextConfig: nextConfig,
      watch: {
        enable: dev,
        pollIntervalMs: nextConfig.watchOptions?.pollIntervalMs,
      },
      dev,
      env: process.env as Record<string, string>,
      defineEnv: createDefineEnv({
        isTurbopack: true,
        clientRouterFilters,
        config: nextConfig,
        dev,
        distDir,
        projectPath,
        fetchCacheKeyPrefix: nextConfig.experimental.fetchCacheKeyPrefix,
        hasRewrites,
        // TODO: Implement
        middlewareMatchers: undefined,
        rewrites: fsChecker.rewrites,
      }),
      buildId,
      encryptionKey,
      previewProps: fsChecker.previewProps,
      browserslistQuery: supportedBrowsers.join(', '),
      noMangling: false,
      writeRoutesHashesManifest: false,
      currentNodeJsVersion,
      isPersistentCachingEnabled: isFileSystemCacheEnabledForDev(nextConfig),
      nextVersion: process.env.__NEXT_VERSION as string,
      serverHmr: serverFastRefresh,
    },
    {
      turbopackMemoryEviction:
        nextConfig.experimental.turbopackMemoryEvictionMode,
      isShortSession: false,
    }
  )
  return { project, encryptionKey }
}
