import type { NextConfigComplete } from '../../server/config-shared'
import type { __ApiPreviewProps } from '../../server/api-utils'

import path from 'path'
import { readFile, stat } from 'node:fs/promises'
import { getStorageDirectory } from '../../server/cache-dir'
import type { CustomRoutes } from '../../lib/load-custom-routes'
import type { createClientRouterFilter } from '../../lib/create-client-router-filter'
import { validateTurboNextConfig } from '../../lib/turbopack-warning'
import { createDefineEnv, loadBindings } from '../swc'
import { isCI } from '../../server/ci-info'
import { backgroundLogCompilationEvents } from '../../shared/lib/turbopack/compilation-events'
import { getSupportedBrowsers } from '../get-supported-browsers'
import { trace } from '../../trace'
import { normalizePath } from '../../lib/normalize-path'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import { printBuildErrors } from '../print-build-errors'

export type AnalyzeContext = {
  config: NextConfigComplete
  distDir: string
  dir: string
  noMangling: boolean
  appDirOnly: boolean
  buildOptions: {
    hasRewrites: boolean
    rewrites: CustomRoutes['rewrites']
    clientRouterFilters?: ReturnType<typeof createClientRouterFilter>
  }
}

// Read only the existing build cache. The key generators intentionally rotate or create
// missing keys, which would no longer match the project that produced this cache.
async function readCachedBuildInputs(distDir: string): Promise<{
  buildId: string
  encryptionKey: string
  previewProps: __ApiPreviewProps
} | null> {
  const storageDir = getStorageDirectory(distDir)
  if (!storageDir) return null
  try {
    await stat(path.join(storageDir, 'turbopack'))
    const [buildId, encryptionData, previewData] = await Promise.all([
      readFile(path.join(distDir, 'BUILD_ID'), 'utf8'),
      readFile(path.join(storageDir, '.rscinfo'), 'utf8'),
      readFile(path.join(storageDir, '.previewinfo'), 'utf8'),
    ])
    const encryption = JSON.parse(encryptionData)
    const preview = JSON.parse(previewData)
    const encryptionKey = encryption['encryption.key']
    if (
      !buildId ||
      typeof encryptionKey !== 'string' ||
      (process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY &&
        process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY !== encryptionKey) ||
      typeof preview.previewModeId !== 'string' ||
      typeof preview.previewModeEncryptionKey !== 'string' ||
      typeof preview.previewModeSigningKey !== 'string'
    ) {
      return null
    }
    return {
      buildId,
      encryptionKey,
      previewProps: {
        previewModeId: preview.previewModeId,
        previewModeEncryptionKey: preview.previewModeEncryptionKey,
        previewModeSigningKey: preview.previewModeSigningKey,
      },
    }
  } catch {
    return null
  }
}

export async function turbopackAnalyze(
  analyzeContext: AnalyzeContext
): Promise<{
  duration: number
  shutdownPromise: Promise<void>
}> {
  await validateTurboNextConfig({
    dir: analyzeContext.dir,
    configPhase: PHASE_PRODUCTION_BUILD,
  })

  const { config, dir, distDir, noMangling, buildOptions } = analyzeContext
  const currentNodeJsVersion = process.versions.node

  const startTime = process.hrtime()
  const bindings = await loadBindings(config?.experimental?.useWasmBinary)

  if (bindings.isWasm) {
    throw new Error(
      `Turbopack analyze is not supported on this platform (${process.platform}/${process.arch}) because native bindings are not available. ` +
        `Only WebAssembly (WASM) bindings were loaded, and Turbopack requires native bindings.\n\n` +
        `For more information, see: https://nextjs.org/docs/app/api-reference/turbopack#supported-platforms`
    )
  }

  const dev = false

  const supportedBrowsers = getSupportedBrowsers(dir, dev)

  const persistentCaching =
    config.experimental?.turbopackFileSystemCacheForBuild || false
  const cachedBuildInputs = persistentCaching
    ? await readCachedBuildInputs(distDir)
    : null
  const rootPath = config.turbopack?.root || config.outputFileTracingRoot || dir
  const projectResult = await bindings.turbo.createProject(
    {
      rootPath: config.turbopack?.root || config.outputFileTracingRoot || dir,
      projectPath: normalizePath(path.relative(rootPath, dir) || '.'),
      distDir,
      nextConfig: config,
      watch: {
        enable: false,
      },
      dev,
      env: process.env as Record<string, string>,
      defineEnv: createDefineEnv({
        isTurbopack: true,
        config,
        dev,
        distDir,
        projectPath: dir,
        fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
        clientRouterFilters: buildOptions.clientRouterFilters,
        hasRewrites: buildOptions.hasRewrites,
        // Implemented separately in Turbopack, doesn't have to be passed here.
        middlewareMatchers: undefined,
        rewrites: buildOptions.rewrites,
      }),
      buildId: cachedBuildInputs?.buildId || 'analyze-build',
      encryptionKey: cachedBuildInputs?.encryptionKey || '',
      previewProps: cachedBuildInputs?.previewProps || {
        previewModeId: '',
        previewModeEncryptionKey: '',
        previewModeSigningKey: '',
      },
      browserslistQuery: supportedBrowsers.join(', '),
      noMangling,
      writeRoutesHashesManifest:
        !!process.env.NEXT_TURBOPACK_WRITE_ROUTES_HASHES_MANIFEST,
      currentNodeJsVersion,
      isPersistentCachingEnabled: persistentCaching,
      deferredEntries: config.experimental.deferredEntries,
      nextVersion: process.env.__NEXT_VERSION as string,
    },
    {
      turbopackMemoryEviction: config.experimental.turbopackMemoryEvictionMode,
      gc: config.experimental.turbopackGcOptions,
      dependencyTracking:
        persistentCaching ||
        (config.experimental.deferredEntries?.length ?? 0) > 0,
      isCi: isCI,
      isShortSession: true,
      skipCompaction: process.env.NEXT_USE_POST_BUILD === '1',
    }
  )
  const project = projectResult.value
  try {
    printBuildErrors(projectResult, dev)

    const analyzeEventsSpan = trace('turbopack-analyze-events')
    // Stop immediately: this span is only used as a parent for
    // manualTraceChild calls which carry their own timestamps.
    analyzeEventsSpan.stop()
    backgroundLogCompilationEvents(project, { parentSpan: analyzeEventsSpan })

    await project.writeAnalyzeData(analyzeContext.appDirOnly)

    const shutdownPromise = project.shutdown()

    const time = process.hrtime(startTime)
    return {
      duration: time[0] + time[1] / 1e9,
      shutdownPromise,
    }
  } catch (err) {
    await project.shutdown()
    throw err
  }
}

let shutdownPromise: Promise<void> | undefined
export async function waitForShutdown(): Promise<void> {
  if (shutdownPromise) {
    await shutdownPromise
  }
}
