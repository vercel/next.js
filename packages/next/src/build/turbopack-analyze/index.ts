import path from 'path'
import { validateTurboNextConfig } from '../../lib/turbopack-warning'
import { isFileSystemCacheEnabledForBuild } from '../../shared/lib/turbopack/utils'
import { createDefineEnv, loadBindings } from '../swc'
import { isCI } from '../../server/ci-info'
import { backgroundLogCompilationEvents } from '../../shared/lib/turbopack/compilation-events'
import { getSupportedBrowsers } from '../utils'
import { normalizePath } from '../../lib/normalize-path'
import type { NextConfigComplete } from '../../server/config-shared'
import type { __ApiPreviewProps } from '../../server/api-utils'

export type AnalyzeContext = {
  config: NextConfigComplete
  distDir: string
  dir: string
  noMangling: boolean
  appDirOnly: boolean
}

export async function turbopackAnalyze(
  analyzeContext: AnalyzeContext
): Promise<{
  duration: number
  shutdownPromise: Promise<void>
}> {
  await validateTurboNextConfig({
    dir: analyzeContext.dir,
    isDev: false,
  })

  const { config, dir, distDir, noMangling } = analyzeContext
  const currentNodeJsVersion = process.versions.node

  const startTime = process.hrtime()
  const bindings = await loadBindings(config?.experimental?.useWasmBinary)
  const dev = false

  const supportedBrowsers = getSupportedBrowsers(dir, dev)

  const persistentCaching = isFileSystemCacheEnabledForBuild(config)
  const rootPath = config.turbopack?.root || config.outputFileTracingRoot || dir
  const project = await bindings.turbo.createProject(
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
        hasRewrites: false,
        // Implemented separately in Turbopack, doesn't have to be passed here.
        middlewareMatchers: undefined,
        rewrites: {
          beforeFiles: [],
          afterFiles: [],
          fallback: [],
        },
      }),
      buildId: 'analyze-build',
      encryptionKey: '',
      previewProps: {
        previewModeId: '',
        previewModeEncryptionKey: '',
        previewModeSigningKey: '',
      },
      browserslistQuery: supportedBrowsers.join(', '),
      noMangling,
      currentNodeJsVersion,
    },
    {
      persistentCaching,
      memoryLimit: config.experimental?.turbopackMemoryLimit,
      dependencyTracking: persistentCaching,
      isCi: isCI,
      isShortSession: true,
    }
  )

  try {
    backgroundLogCompilationEvents(project)

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
