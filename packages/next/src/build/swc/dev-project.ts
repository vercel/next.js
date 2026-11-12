import { relative } from 'path'
import { serializeBrowserFixtureHost } from './browser-fixtures'
import type { BrowserFixtureHost } from '../../experimental/testing/contracts'
import { createDefineEnv, getBindingsSync } from './index'
import type { NextConfigComplete } from '../../server/config-shared'
import type { ProjectOptions } from './types'
import { generateEncryptionKeyBase64 } from '../../server/app-render/encryption-utils-server'
import { getSupportedBrowsers } from '../get-supported-browsers'
import { normalizePath } from '../../lib/normalize-path'
import { seedTurbopackCacheIfNeeded } from '../../lib/turbopack-cache-seed'
import { printNonFatalIssue } from '../../server/dev/turbopack-utils'
import { isFileSystemCacheEnabledForDev } from '../../shared/lib/turbopack/utils'

/** Shared by next dev and the explicit App RSC test compiler consumer. */
export async function createDevTurbopackProject({
  projectPath,
  nextConfig,
  distDir,
  fsChecker,
  serverFastRefresh,
  browserFixtureHost,
  captureNodejsDefineEnvKeys,
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
  /** Private names-only observation of the same map passed to the native project. */
  captureNodejsDefineEnvKeys?: true
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

  const projectOptions: ProjectOptions = {
    rootPath,
    browserFixtureHost: browserFixtureHost
      ? serializeBrowserFixtureHost(projectPath, browserFixtureHost)
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
  }
  const nodejsDefineEnvKeys = captureNodejsDefineEnvKeys
    ? Object.freeze(projectOptions.defineEnv.nodejs.map(({ name }) => name))
    : undefined
  const nativeProjectPaths = Object.freeze({
    rootPath: projectOptions.rootPath,
    projectPath: projectOptions.projectPath,
  })
  const projectResult = await getBindingsSync().turbo.createProject(
    projectOptions,
    {
      turbopackMemoryEviction:
        nextConfig.experimental.turbopackMemoryEvictionMode,
      gc: nextConfig.experimental.turbopackGcOptions,
      isShortSession: false,
    }
  )
  for (const issue of projectResult.issues) {
    printNonFatalIssue(issue)
  }
  return {
    project: projectResult.value,
    encryptionKey,
    nativeProjectPaths,
    ...(nodejsDefineEnvKeys ? { nodejsDefineEnvKeys } : {}),
  }
}
