import type { NextConfigComplete } from '../../server/config-shared'
import type { __ApiPreviewProps } from '../../server/api-utils'

import { setGlobal } from '../../trace'
import * as Log from '../output/log'
import * as path from 'node:path'
import loadConfig from '../../server/config'
import { PHASE_ANALYZE } from '../../shared/lib/constants'
import { turbopackAnalyze, type AnalyzeContext } from '../turbopack-analyze'
import { durationToString } from '../duration-to-string'
import { cp, writeFile, mkdir } from 'node:fs/promises'
import {
  collectAppFiles,
  collectPagesFiles,
  createPagesMapping,
} from '../entries'
import { createValidFileMatcher } from '../../server/lib/find-page-file'
import { findPagesDir } from '../../lib/find-pages-dir'
import { PAGE_TYPES } from '../../lib/page-types'
import loadCustomRoutes from '../../lib/load-custom-routes'
import { generateRoutesManifest } from '../generate-routes-manifest'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import http from 'node:http'

// @ts-expect-error types are in @types/serve-handler
import serveHandler from 'next/dist/compiled/serve-handler'
import { Telemetry } from '../../telemetry/storage'
import { eventAnalyzeCompleted } from '../../telemetry/events'
import { traceGlobals } from '../../trace/shared'
import type { RoutesManifest } from '..'

export type AnalyzeOptions = {
  dir: string
  reactProductionProfiling?: boolean
  noMangling?: boolean
  appDirOnly?: boolean
  output?: boolean
  port?: number
}

export default async function analyze({
  dir,
  reactProductionProfiling = false,
  noMangling = false,
  appDirOnly = false,
  output = false,
  port = 4000,
}: AnalyzeOptions): Promise<void> {
  try {
    const config: NextConfigComplete = await loadConfig(PHASE_ANALYZE, dir, {
      silent: false,
      reactProductionProfiling,
    })

    process.env.NEXT_DEPLOYMENT_ID = config.deploymentId || ''

    const distDir = path.join(dir, '.next')
    const telemetry = new Telemetry({ distDir })
    setGlobal('phase', PHASE_ANALYZE)
    setGlobal('distDir', distDir)
    setGlobal('telemetry', telemetry)

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

    await cp(path.join(__dirname, '../../bundle-analyzer'), analyzeDir, {
      recursive: true,
    })
    await mkdir(path.join(analyzeDir, 'data'), { recursive: true })
    await writeFile(
      path.join(analyzeDir, 'data', 'routes.json'),
      JSON.stringify(routes, null, 2)
    )

    let logMessage = `Analyze completed in ${durationString}.`
    if (output) {
      logMessage += ` Results written to ${analyzeDir}.\nTo explore the analyze results interactively, run \`next experimental-analyze\` without \`--output\`.`
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
    }
  } catch (e) {
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
  const validFileMatcher = createValidFileMatcher(config.pageExtensions, appDir)

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

  const { appPaths } = appDir
    ? await collectAppFiles(appDir, validFileMatcher)
    : { appPaths: [] }
  const pagesPaths = pagesDir
    ? await collectPagesFiles(pagesDir, validFileMatcher)
    : null

  const appMapping = await createPagesMapping({
    pagePaths: appPaths,
    isDev: false,
    pagesType: PAGE_TYPES.APP,
    pageExtensions: config.pageExtensions,
    pagesDir,
    appDir,
    appDirOnly,
  })

  const pagesMapping = pagesPaths
    ? await createPagesMapping({
        pagePaths: pagesPaths,
        isDev: false,
        pagesType: PAGE_TYPES.PAGES,
        pageExtensions: config.pageExtensions,
        pagesDir,
        appDir,
        appDirOnly,
      })
    : null

  const pageKeys = {
    pages: pagesMapping ? Object.keys(pagesMapping) : [],
    app: appMapping
      ? Object.keys(appMapping).map((key) => normalizeAppPath(key))
      : undefined,
  }

  // Load custom routes
  const { redirects, headers, rewrites } = await loadCustomRoutes(config)

  // Compute restricted redirect paths
  const restrictedRedirectPaths = ['/_next'].map((pathPrefix) =>
    config.basePath ? `${config.basePath}${pathPrefix}` : pathPrefix
  )

  const isAppPPREnabled = !!config.cacheComponents

  // Generate routes manifest
  const { routesManifest } = generateRoutesManifest({
    appType,
    pageKeys,
    config,
    redirects,
    headers,
    rewrites,
    restrictedRedirectPaths,
    isAppPPREnabled,
  })

  return routesManifest.dynamicRoutes
    .map((r) => r.page)
    .concat(routesManifest.staticRoutes.map((r) => r.page))
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
