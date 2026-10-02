import type { NextConfigComplete } from '../../server/config-shared'
import type { __ApiPreviewProps } from '../../server/api-utils'

import { setGlobal } from '../../trace'
import * as Log from '../output/log'
import * as path from 'node:path'
import loadConfig from '../../server/config'
import { PHASE_ANALYZE } from '../../shared/lib/constants'
import { turbopackAnalyze, type AnalyzeContext } from '../turbopack-analyze'
import { durationToString } from '../duration-to-string'
import { Lockfile } from '../lockfile'
import { installBindings } from '../swc/install-bindings'
import { cpSync, writeFileSync, mkdirSync } from 'node:fs'
import { discoverRoutes } from '../route-discovery'
import { findPagesDir } from '../../lib/find-pages-dir'
import loadCustomRoutes from '../../lib/load-custom-routes'
import { generateRoutesManifest } from '../generate-routes-manifest'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { writeAnalyzeSnapshot, type SnapshotMetadata } from './snapshot'
import http from 'node:http'

// @ts-expect-error types are in @types/serve-handler
import serveHandler from 'next/dist/compiled/serve-handler'
import { Telemetry } from '../../telemetry/storage'
import { eventAnalyzeCompleted } from '../../telemetry/events'
import { traceGlobals } from '../../trace/shared'
import type { RoutesManifest } from '..'
import { Bundler } from '../../lib/bundler'

export type AnalyzeOptions = {
  dir: string
  reactProductionProfiling?: boolean
  noMangling?: boolean
  appDirOnly?: boolean
  output?: boolean
  port?: number
  /** User-supplied snapshot name stored in the snapshot metadata, overriding branch/sha in the UI. */
  snapshotName?: string
}

export default async function analyze({
  dir,
  reactProductionProfiling = false,
  noMangling = false,
  appDirOnly = false,
  output = false,
  port = 4000,
  snapshotName,
}: AnalyzeOptions): Promise<SnapshotMetadata> {
  let lockfile: Lockfile | undefined
  try {
    // analyze is Turbopack-only. Mirror what parseBundlerArgs does for build/dev
    // so every process.env.TURBOPACK consumer in this run agrees with the bundler choice.
    process.env.TURBOPACK ??= '1'
    const config: NextConfigComplete = await loadConfig(PHASE_ANALYZE, dir, {
      silent: false,
      reactProductionProfiling,
      bundler: Bundler.Turbopack,
    })

    process.env.NEXT_DEPLOYMENT_ID = config.deploymentId || ''

    const distDir = path.join(dir, config.distDir)
    const telemetry = new Telemetry({ distDir })
    setGlobal('phase', PHASE_ANALYZE)
    setGlobal('distDir', distDir)
    setGlobal('telemetry', telemetry)

    // Native locks require synchronous access to bindings. Like next build,
    // install them before acquiring the lock, but still lock before writes.
    await installBindings(config.experimental?.useWasmBinary)

    // Match next build/dev: protect the directory before Turbopack writes its
    // data, not only the later snapshot copy. The UI keeps this lock until exit.
    if (config.experimental.lockDistDir) {
      mkdirSync(distDir, { recursive: true })
      lockfile = await Lockfile.acquireWithRetriesOrExit(
        path.join(distDir, 'lock'),
        'next analyze'
      )
    }
    Log.info('Analyzing a production build...')

    const analyzeContext: AnalyzeContext = {
      config,
      dir,
      distDir,
      noMangling,
      appDirOnly,
    }

    const { duration: analyzeDuration, shutdownPromise } =
      await turbopackAnalyze(analyzeContext)

    const durationString = durationToString(analyzeDuration)
    const analyzeDir = path.join(distDir, 'diagnostics/analyze')

    await shutdownPromise

    const routes = await collectRoutesForAnalyze(dir, config, appDirOnly)

    cpSync(path.join(__dirname, '../../bundle-analyzer'), analyzeDir, {
      recursive: true,
    })
    mkdirSync(path.join(analyzeDir, 'data'), { recursive: true })
    writeFileSync(
      path.join(analyzeDir, 'data', 'routes.json'),
      JSON.stringify(routes, null, 2)
    )

    // Capture this build alongside any prior builds so the analyzer UI can
    // offer it as a comparison baseline in the future.
    const snapshot = writeAnalyzeSnapshot({
      projectDir: dir,
      analyzeDir,
      routes,
      appDirOnly,
      noMangling,
      snapshotName,
    })

    let logMessage = `Analyze completed in ${durationString}.`
    if (output) {
      logMessage += ` Results written to ${analyzeDir}.\nTo explore the analyze results interactively, run \`next analyze\` without \`--output\`.`
    }
    Log.event(logMessage)

    telemetry.record(
      eventAnalyzeCompleted({
        success: true,
        durationInSeconds: Math.round(analyzeDuration),
        totalPageCount: routes.length,
      })
    )

    if (!output) {
      await startServer(analyzeDir, port)
    } else {
      // Headless capture is complete; release the lock for another build even
      // when the analyzer is invoked programmatically rather than via the CLI.
      await lockfile?.unlock()
      lockfile = undefined
    }
    return snapshot
  } catch (e) {
    await lockfile?.unlock()
    const telemetry = traceGlobals.get('telemetry') as Telemetry | undefined
    if (telemetry) {
      telemetry.record(
        eventAnalyzeCompleted({
          success: false,
        })
      )
    }

    throw e
  }
}

/**
 * Collects all routes from the project for the bundle analyzer.
 * Returns a list of route paths (both static and dynamic).
 */
async function collectRoutesForAnalyze(
  dir: string,
  config: NextConfigComplete,
  appDirOnly: boolean
): Promise<string[]> {
  const { pagesDir, appDir } = findPagesDir(dir)

  let appType: RoutesManifest['appType']
  if (pagesDir && appDir) {
    appType = 'hybrid'
  } else if (pagesDir) {
    appType = 'pages'
  } else if (appDir) {
    appType = 'app'
  } else {
    throw new Error('No pages or app directory found.')
  }

  const discovery = await discoverRoutes({
    appDir,
    pagesDir,
    pageExtensions: config.pageExtensions,
    isDev: false,
    baseDir: dir,
    isSrcDir: path.relative(dir, pagesDir || appDir || '').startsWith('src'),
    appDirOnly,
  })

  const pageKeys = {
    pages: Object.keys(discovery.mappedPages || {}),
    app: discovery.mappedAppPages
      ? Object.keys(discovery.mappedAppPages).map((key) =>
          normalizeAppPath(key)
        )
      : [],
  }

  // Load custom routes
  const { redirects, headers, onMatchHeaders, rewrites } =
    await loadCustomRoutes(config)

  // Compute restricted redirect paths
  const restrictedRedirectPaths = ['/_next'].map((pathPrefix) =>
    config.basePath ? `${config.basePath}${pathPrefix}` : pathPrefix
  )

  const isAppPPREnabled = Boolean(config.cacheComponents)

  // Generate routes manifest
  const { routesManifest } = generateRoutesManifest({
    appType,
    pageKeys,
    config,
    redirects,
    headers,
    onMatchHeaders,
    rewrites,
    restrictedRedirectPaths,
    isAppPPREnabled,
  })

  return Array.from(
    new Set(
      routesManifest.dynamicRoutes
        .map((r) => r.page)
        .concat(routesManifest.staticRoutes.map((r) => r.page))
    )
  )
}

function startServer(dir: string, port: number): Promise<void> {
  const server = http.createServer((req, res) => {
    return serveHandler(req, res, {
      public: dir,
    })
  })

  return new Promise((resolve, reject) => {
    function onError(err: Error) {
      server.close(() => {
        reject(err)
      })
    }

    server.on('error', onError)

    server.listen(port, 'localhost', () => {
      const address = server.address()
      if (address == null) {
        reject(new Error('Unable to get server address'))
        return
      }

      // No longer needed after startup
      server.removeListener('error', onError)

      let addressString
      if (typeof address === 'string') {
        addressString = address
      } else if (
        address.family === 'IPv6' &&
        (address.address === '::' || address.address === '::1')
      ) {
        addressString = `localhost:${address.port}`
      } else if (address.family === 'IPv6') {
        addressString = `[${address.address}]:${address.port}`
      } else {
        addressString = `${address.address}:${address.port}`
      }

      Log.info(`Bundle analyzer available at http://${addressString}`)
      resolve()
    })
  })
}
