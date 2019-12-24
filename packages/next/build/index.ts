import chalk from 'chalk'
import ciEnvironment from 'ci-info'
import findUp from 'find-up'
import fs from 'fs'
import Worker from 'jest-worker'
import mkdirpOrig from 'mkdirp'
import nanoid from 'next/dist/compiled/nanoid/index.js'
import path from 'path'
import { pathToRegexp } from 'path-to-regexp'
import { promisify } from 'util'
import formatWebpackMessages from '../client/dev/error-overlay/format-webpack-messages'
import checkCustomRoutes from '../lib/check-custom-routes'
import { PUBLIC_DIR_MIDDLEWARE_CONFLICT } from '../lib/constants'
import { findPagesDir } from '../lib/find-pages-dir'
import { recursiveDelete } from '../lib/recursive-delete'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { verifyTypeScriptSetup } from '../lib/verifyTypeScriptSetup'
import {
  BUILD_MANIFEST,
  DEFAULT_REDIRECT_STATUS,
  EXPORT_DETAIL,
  EXPORT_MARKER,
  PAGES_MANIFEST,
  PHASE_PRODUCTION_BUILD,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
} from '../next-server/lib/constants'
import {
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../next-server/lib/router/utils'
import loadConfig, {
  isTargetLikeServerless,
} from '../next-server/server/config'
import {
  eventBuildDuration,
  eventBuildOptimize,
  eventNextPlugins,
  eventVersion,
} from '../telemetry/events'
import { Telemetry } from '../telemetry/storage'
import { CompilerResult, runCompiler } from './compiler'
import { createEntrypoints, createPagesMapping } from './entries'
import { generateBuildId } from './generate-build-id'
import { isWriteable } from './is-writeable'
import createSpinner from './spinner'
import {
  collectPages,
  getPageSizeInKb,
  hasCustomAppGetInitialProps,
  PageInfo,
  printCustomRoutes,
  printTreeView,
} from './utils'
import getBaseWebpackConfig from './webpack-config'
import { writeBuildId } from './write-build-id'

const fsAccess = promisify(fs.access)
const fsUnlink = promisify(fs.unlink)
const fsRmdir = promisify(fs.rmdir)
const fsStat = promisify(fs.stat)
const fsMove = promisify(fs.rename)
const fsReadFile = promisify(fs.readFile)
const fsWriteFile = promisify(fs.writeFile)
const mkdirp = promisify(mkdirpOrig)

const staticCheckWorker = require.resolve('./utils')

export type SprRoute = {
  initialRevalidateSeconds: number | false
  srcRoute: string | null
  dataRoute: string
}

export type DynamicSprRoute = {
  routeRegex: string

  dataRoute: string
  dataRouteRegex: string
}

export type PrerenderManifest = {
  version: number
  routes: { [route: string]: SprRoute }
  dynamicRoutes: { [route: string]: DynamicSprRoute }
}

export default async function build(dir: string, conf = null): Promise<void> {
  if (!(await isWriteable(dir))) {
    throw new Error(
      '> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable'
    )
  }

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const { target } = config
  const buildId = await generateBuildId(config.generateBuildId, nanoid)
  const distDir = path.join(dir, config.distDir)
  const rewrites = []
  const redirects = []

  if (typeof config.experimental.redirects === 'function') {
    redirects.push(...(await config.experimental.redirects()))
    checkCustomRoutes(redirects, 'redirect')
  }
  if (typeof config.experimental.rewrites === 'function') {
    rewrites.push(...(await config.experimental.rewrites()))
    checkCustomRoutes(rewrites, 'rewrite')
  }

  if (ciEnvironment.isCI) {
    const cacheDir = path.join(distDir, 'cache')
    const hasCache = await fsAccess(cacheDir)
      .then(() => true)
      .catch(() => false)

    if (!hasCache) {
      // Intentionally not piping to stderr in case people fail in CI when
      // stderr is detected.
      console.log(
        chalk.bold.yellow(`Warning: `) +
          chalk.bold(
            `No build cache found. Please configure build caching for faster rebuilds. Read more: https://err.sh/next.js/no-cache`
          )
      )
      console.log('')
    }
  }

  const buildSpinner = createSpinner({
    prefixText: 'Creating an optimized production build',
  })

  const telemetry = new Telemetry({ distDir })

  const publicDir = path.join(dir, 'public')
  const pagesDir = findPagesDir(dir)
  let publicFiles: string[] = []
  let hasPublicDir = false

  telemetry.record(
    eventVersion({
      cliCommand: 'build',
      isSrcDir: path.relative(dir, pagesDir!).startsWith('src'),
      hasNowJson: !!(await findUp('now.json', { cwd: dir })),
      isCustomServer: null,
    })
  )

  eventNextPlugins(path.resolve(dir)).then(events => telemetry.record(events))

  await verifyTypeScriptSetup(dir, pagesDir)

  try {
    await fsStat(publicDir)
    hasPublicDir = true
  } catch (_) {}

  if (hasPublicDir) {
    publicFiles = await recursiveReadDir(publicDir, /.*/)
  }

  let tracer: any = null
  if (config.experimental.profiling) {
    const { createTrace } = require('./profiler/profiler.js')
    tracer = createTrace(path.join(distDir, `profile-events.json`))
    tracer.profiler.startProfiling()
  }

  const isLikeServerless = isTargetLikeServerless(target)

  const pagePaths: string[] = await collectPages(
    pagesDir,
    config.pageExtensions
  )

  // needed for static exporting since we want to replace with HTML
  // files
  const allStaticPages = new Set<string>()
  let allPageInfos = new Map<string, PageInfo>()

  const mappedPages = createPagesMapping(pagePaths, config.pageExtensions)
  const entrypoints = createEntrypoints(mappedPages, target, buildId, config)
  const pageKeys = Object.keys(mappedPages)
  const dynamicRoutes = pageKeys.filter(page => isDynamicRoute(page))
  const conflictingPublicFiles: string[] = []

  if (hasPublicDir) {
    try {
      await fsStat(path.join(publicDir, '_next'))
      throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT)
    } catch (err) {}
  }

  for (let file of publicFiles) {
    file = file
      .replace(/\\/g, '/')
      .replace(/\/index$/, '')
      .split(publicDir)
      .pop()!

    if (mappedPages[file]) {
      conflictingPublicFiles.push(file)
    }
  }
  const numConflicting = conflictingPublicFiles.length

  if (numConflicting) {
    throw new Error(
      `Conflicting public and page file${
        numConflicting === 1 ? ' was' : 's were'
      } found. https://err.sh/zeit/next.js/conflicting-public-file-page\n${conflictingPublicFiles.join(
        '\n'
      )}`
    )
  }

  const buildCustomRoute = (
    r: {
      source: string
      statusCode?: number
    },
    isRedirect = false
  ) => {
    const keys: any[] = []
    const routeRegex = pathToRegexp(r.source, keys, {
      strict: true,
      sensitive: false,
      delimiter: '/', // default is `/#?`, but Next does not pass query info
    })

    return {
      ...r,
      ...(isRedirect
        ? {
            statusCode: r.statusCode || DEFAULT_REDIRECT_STATUS,
          }
        : {}),
      regex: routeRegex.source,
      regexKeys: keys.map(k => k.name),
    }
  }

  await mkdirp(distDir)
  await fsWriteFile(
    path.join(distDir, ROUTES_MANIFEST),
    JSON.stringify({
      version: 1,
      redirects: redirects.map(r => buildCustomRoute(r, true)),
      rewrites: rewrites.map(r => buildCustomRoute(r)),
      dynamicRoutes: getSortedRoutes(dynamicRoutes).map(page => ({
        page,
        regex: getRouteRegex(page).re.source,
      })),
    }),
    'utf8'
  )

  const configs = await Promise.all([
    getBaseWebpackConfig(dir, {
      tracer,
      buildId,
      isServer: false,
      config,
      target,
      pagesDir,
      entrypoints: entrypoints.client,
    }),
    getBaseWebpackConfig(dir, {
      tracer,
      buildId,
      isServer: true,
      config,
      target,
      pagesDir,
      entrypoints: entrypoints.server,
    }),
  ])

  const clientConfig = configs[0]

  if (
    clientConfig.optimization &&
    (clientConfig.optimization.minimize !== true ||
      (clientConfig.optimization.minimizer &&
        clientConfig.optimization.minimizer.length === 0))
  ) {
    console.warn(
      chalk.bold.yellow(`Warning: `) +
        chalk.bold(
          `Production code optimization has been disabled in your project. Read more: https://err.sh/zeit/next.js/minification-disabled`
        )
    )
  }

  const webpackBuildStart = process.hrtime()

  let result: CompilerResult = { warnings: [], errors: [] }
  // TODO: why do we need this?? https://github.com/zeit/next.js/issues/8253
  if (isLikeServerless) {
    const clientResult = await runCompiler(clientConfig)
    // Fail build if clientResult contains errors
    if (clientResult.errors.length > 0) {
      result = {
        warnings: [...clientResult.warnings],
        errors: [...clientResult.errors],
      }
    } else {
      const serverResult = await runCompiler(configs[1])
      result = {
        warnings: [...clientResult.warnings, ...serverResult.warnings],
        errors: [...clientResult.errors, ...serverResult.errors],
      }
    }
  } else {
    result = await runCompiler(configs)
  }

  const webpackBuildEnd = process.hrtime(webpackBuildStart)
  if (buildSpinner) {
    buildSpinner.stopAndPersist()
  }
  console.log()

  result = formatWebpackMessages(result)

  if (result.errors.length > 0) {
    // Only keep the first error. Others are often indicative
    // of the same problem, but confuse the reader with noise.
    if (result.errors.length > 1) {
      result.errors.length = 1
    }
    const error = result.errors.join('\n\n')

    console.error(chalk.red('Failed to compile.\n'))

    if (
      error.indexOf('private-next-pages') > -1 &&
      error.indexOf('does not contain a default export') > -1
    ) {
      const page_name_regex = /'private-next-pages\/(?<page_name>[^']*)'/
      const parsed = page_name_regex.exec(error)
      const page_name = parsed && parsed.groups && parsed.groups.page_name
      throw new Error(
        `webpack build failed: found page without a React Component as default export in pages/${page_name}\n\nSee https://err.sh/zeit/next.js/page-without-valid-component for more info.`
      )
    }

    console.error(error)
    console.error()

    if (
      error.indexOf('private-next-pages') > -1 ||
      error.indexOf('__next_polyfill__') > -1
    ) {
      throw new Error(
        '> webpack config.resolve.alias was incorrectly overriden. https://err.sh/zeit/next.js/invalid-resolve-alias'
      )
    }
    throw new Error('> Build failed because of webpack errors')
  } else if (result.warnings.length > 0) {
    console.warn(chalk.yellow('Compiled with warnings.\n'))
    console.warn(result.warnings.join('\n\n'))
    console.warn()
  } else {
    console.log(chalk.green('Compiled successfully.\n'))
    telemetry.record(
      eventBuildDuration({
        totalPageCount: pagePaths.length,
        durationInSeconds: webpackBuildEnd[0],
      })
    )
  }
  const postBuildSpinner = createSpinner({
    prefixText: 'Automatically optimizing pages',
  })

  const manifestPath = path.join(
    distDir,
    isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
    PAGES_MANIFEST
  )
  const buildManifestPath = path.join(distDir, BUILD_MANIFEST)

  const sprPages = new Set<string>()
  const staticPages = new Set<string>()
  const invalidPages = new Set<string>()
  const hybridAmpPages = new Set<string>()
  const additionalSprPaths = new Map<string, Array<string>>()
  const pageInfos = new Map<string, PageInfo>()
  const pagesManifest = JSON.parse(await fsReadFile(manifestPath, 'utf8'))
  const buildManifest = JSON.parse(await fsReadFile(buildManifestPath, 'utf8'))

  let customAppGetInitialProps: boolean | undefined

  process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD

  const staticCheckWorkers = new Worker(staticCheckWorker, {
    numWorkers: config.experimental.cpus,
    enableWorkerThreads: config.experimental.workerThreads,
  })
  staticCheckWorkers.getStdout().pipe(process.stdout)
  staticCheckWorkers.getStderr().pipe(process.stderr)

  const analysisBegin = process.hrtime()
  await Promise.all(
    pageKeys.map(async page => {
      const actualPage = page === '/' ? '/index' : page
      const size = await getPageSizeInKb(
        actualPage,
        distDir,
        buildId,
        buildManifest,
        config.experimental.modern
      )
      const bundleRelative = path.join(
        isLikeServerless ? 'pages' : `static/${buildId}/pages`,
        actualPage + '.js'
      )
      const serverBundle = path.join(
        distDir,
        isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
        bundleRelative
      )

      let isSsg = false
      let isStatic = false
      let isHybridAmp = false
      let ssgPageRoutes: string[] | null = null

      pagesManifest[page] = bundleRelative.replace(/\\/g, '/')

      const runtimeEnvConfig = {
        publicRuntimeConfig: config.publicRuntimeConfig,
        serverRuntimeConfig: config.serverRuntimeConfig,
      }
      const nonReservedPage = !page.match(/^\/(_app|_error|_document|api)/)

      if (nonReservedPage && customAppGetInitialProps === undefined) {
        customAppGetInitialProps = hasCustomAppGetInitialProps(
          isLikeServerless
            ? serverBundle
            : path.join(
                distDir,
                SERVER_DIRECTORY,
                `/static/${buildId}/pages/_app.js`
              ),
          runtimeEnvConfig
        )

        if (customAppGetInitialProps) {
          console.warn(
            chalk.bold.yellow(`Warning: `) +
              chalk.yellow(
                `You have opted-out of Automatic Static Optimization due to \`getInitialProps\` in \`pages/_app\`.`
              )
          )
          console.warn(
            'Read more: https://err.sh/next.js/opt-out-auto-static-optimization\n'
          )
        }
      }

      if (nonReservedPage) {
        try {
          let result: any = await (staticCheckWorkers as any).isPageStatic(
            page,
            serverBundle,
            runtimeEnvConfig
          )

          if (result.isHybridAmp) {
            isHybridAmp = true
            hybridAmpPages.add(page)
          }

          if (result.prerender) {
            sprPages.add(page)
            isSsg = true

            if (result.prerenderRoutes) {
              additionalSprPaths.set(page, result.prerenderRoutes)
              ssgPageRoutes = result.prerenderRoutes
            }
          } else if (result.static && customAppGetInitialProps === false) {
            staticPages.add(page)
            isStatic = true
          }
        } catch (err) {
          if (err.message !== 'INVALID_DEFAULT_EXPORT') throw err
          invalidPages.add(page)
        }
      }

      pageInfos.set(page, {
        size,
        serverBundle,
        static: isStatic,
        isSsg,
        isHybridAmp,
        ssgPageRoutes,
      })
    })
  )
  staticCheckWorkers.end()

  if (invalidPages.size > 0) {
    throw new Error(
      `Build optimization failed: found page${
        invalidPages.size === 1 ? '' : 's'
      } without a React Component as default export in \n${[...invalidPages]
        .map(pg => `pages${pg}`)
        .join(
          '\n'
        )}\n\nSee https://err.sh/zeit/next.js/page-without-valid-component for more info.\n`
    )
  }

  if (Array.isArray(configs[0].plugins)) {
    configs[0].plugins.some((plugin: any) => {
      if (!plugin.ampPages) {
        return false
      }

      plugin.ampPages.forEach((pg: any) => {
        pageInfos.get(pg)!.isAmp = true
      })
      return true
    })
  }

  await writeBuildId(distDir, buildId)

  if (config.experimental.catchAllRouting !== true) {
    if (dynamicRoutes.some(page => /\/\[\.{3}[^/]+?\](?=\/|$)/.test(page))) {
      throw new Error(
        'Catch-all routing is still experimental. You cannot use it yet.'
      )
    }
  }
  const finalPrerenderRoutes: { [route: string]: SprRoute } = {}
  const tbdPrerenderRoutes: string[] = []

  if (staticPages.size > 0 || sprPages.size > 0) {
    const combinedPages = [...staticPages, ...sprPages]
    const exportApp = require('../export').default
    const exportOptions = {
      sprPages,
      silent: true,
      buildExport: true,
      threads: config.experimental.cpus,
      pages: combinedPages,
      outdir: path.join(distDir, 'export'),
    }
    const exportConfig: any = {
      ...config,
      initialPageRevalidationMap: {},
      // Default map will be the collection of automatic statically exported
      // pages and SPR pages.
      // n.b. we cannot handle this above in combinedPages because the dynamic
      // page must be in the `pages` array, but not in the mapping.
      exportPathMap: (defaultMap: any) => {
        // Remove dynamically routed pages from the default path map. These
        // pages cannot be prerendered because we don't have enough information
        // to do so.
        //
        // Note: prerendering disables automatic static optimization.
        sprPages.forEach(page => {
          if (isDynamicRoute(page)) {
            tbdPrerenderRoutes.push(page)
            delete defaultMap[page]
          }
        })
        // Append the "well-known" routes we should prerender for, e.g. blog
        // post slugs.
        additionalSprPaths.forEach((routes, page) => {
          routes.forEach(route => {
            defaultMap[route] = { page }
          })
        })
        return defaultMap
      },
      exportTrailingSlash: false,
    }
    await exportApp(dir, exportOptions, exportConfig)

    // remove server bundles that were exported
    for (const page of staticPages) {
      const { serverBundle } = pageInfos.get(page)!
      await fsUnlink(serverBundle)
    }

    const moveExportedPage = async (
      page: string,
      file: string,
      isSpr: boolean,
      ext: 'html' | 'json'
    ) => {
      file = `${file}.${ext}`
      const orig = path.join(exportOptions.outdir, file)
      const relativeDest = (isLikeServerless
        ? path.join('pages', file)
        : path.join('static', buildId, 'pages', file)
      ).replace(/\\/g, '/')

      const dest = path.join(
        distDir,
        isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
        relativeDest
      )

      if (!isSpr) {
        pagesManifest[page] = relativeDest
        if (page === '/') pagesManifest['/index'] = relativeDest
        if (page === '/.amp') pagesManifest['/index.amp'] = relativeDest
      }
      await mkdirp(path.dirname(dest))
      await fsMove(orig, dest)
    }

    for (const page of combinedPages) {
      const isSpr = sprPages.has(page)
      const isDynamic = isDynamicRoute(page)
      let file = page === '/' ? '/index' : page
      // The dynamic version of SPR pages are not prerendered. Below, we handle
      // the specific prerenders of these.
      if (!(isSpr && isDynamic)) {
        await moveExportedPage(page, file, isSpr, 'html')
      }
      const hasAmp = hybridAmpPages.has(page)
      if (hasAmp) {
        await moveExportedPage(`${page}.amp`, `${file}.amp`, isSpr, 'html')
      }

      if (isSpr) {
        // For a non-dynamic SPR page, we must copy its data file from export.
        if (!isDynamic) {
          await moveExportedPage(page, file, true, 'json')

          finalPrerenderRoutes[page] = {
            initialRevalidateSeconds:
              exportConfig.initialPageRevalidationMap[page],
            srcRoute: null,
            dataRoute: path.posix.join(
              '/_next/data',
              buildId,
              `${page === '/' ? '/index' : page}.json`
            ),
          }
        } else {
          // For a dynamic SPR page, we did not copy its html nor data exports.
          // Instead, we must copy specific versions of this page as defined by
          // `unstable_getStaticPaths` (additionalSprPaths).
          const extraRoutes = additionalSprPaths.get(page) || []
          for (const route of extraRoutes) {
            await moveExportedPage(route, route, true, 'html')
            await moveExportedPage(route, route, true, 'json')
            finalPrerenderRoutes[route] = {
              initialRevalidateSeconds:
                exportConfig.initialPageRevalidationMap[route],
              srcRoute: page,
              dataRoute: path.posix.join(
                '/_next/data',
                buildId,
                `${route === '/' ? '/index' : route}.json`
              ),
            }
          }
        }
      }
    }

    // remove temporary export folder
    await recursiveDelete(exportOptions.outdir)
    await fsRmdir(exportOptions.outdir)
    await fsWriteFile(manifestPath, JSON.stringify(pagesManifest), 'utf8')
  }

  if (postBuildSpinner) postBuildSpinner.stopAndPersist()
  console.log()

  const analysisEnd = process.hrtime(analysisBegin)
  telemetry.record(
    eventBuildOptimize({
      durationInSeconds: analysisEnd[0],
      totalPageCount: pagePaths.length,
      staticPageCount: staticPages.size,
      ssrPageCount: pagePaths.length - staticPages.size,
    })
  )

  if (sprPages.size > 0) {
    const finalDynamicRoutes: PrerenderManifest['dynamicRoutes'] = {}
    tbdPrerenderRoutes.forEach(tbdRoute => {
      const dataRoute = path.posix.join(
        '/_next/data',
        buildId,
        `${tbdRoute === '/' ? '/index' : tbdRoute}.json`
      )

      finalDynamicRoutes[tbdRoute] = {
        routeRegex: getRouteRegex(tbdRoute).re.source,
        dataRoute,
        dataRouteRegex: getRouteRegex(
          dataRoute.replace(/\.json$/, '')
        ).re.source.replace(/\(\?:\\\/\)\?\$$/, '\\.json$'),
      }
    })
    const prerenderManifest: PrerenderManifest = {
      version: 1,
      routes: finalPrerenderRoutes,
      dynamicRoutes: finalDynamicRoutes,
    }

    await fsWriteFile(
      path.join(distDir, PRERENDER_MANIFEST),
      JSON.stringify(prerenderManifest),
      'utf8'
    )
  }

  await fsWriteFile(
    path.join(distDir, EXPORT_MARKER),
    JSON.stringify({
      version: 1,
      hasExportPathMap: typeof config.exportPathMap === 'function',
      exportTrailingSlash: config.exportTrailingSlash === true,
    }),
    'utf8'
  )
  await fsUnlink(path.join(distDir, EXPORT_DETAIL)).catch(err => {
    if (err.code === 'ENOENT') {
      return Promise.resolve()
    }
    return Promise.reject(err)
  })

  staticPages.forEach(pg => allStaticPages.add(pg))
  pageInfos.forEach((info: PageInfo, key: string) => {
    allPageInfos.set(key, info)
  })

  await printTreeView(
    Object.keys(mappedPages),
    allPageInfos,
    isLikeServerless,
    {
      distPath: distDir,
      pagesDir,
      pageExtensions: config.pageExtensions,
      buildManifest,
      isModern: config.experimental.modern,
    }
  )
  printCustomRoutes({ redirects, rewrites })

  if (tracer) {
    const parsedResults = await tracer.profiler.stopProfiling()
    await new Promise(resolve => {
      if (parsedResults === undefined) {
        tracer.profiler.destroy()
        tracer.trace.flush()
        tracer.end(resolve)
        return
      }

      const cpuStartTime = parsedResults.profile.startTime
      const cpuEndTime = parsedResults.profile.endTime

      tracer.trace.completeEvent({
        name: 'TaskQueueManager::ProcessTaskFromWorkQueue',
        id: ++tracer.counter,
        cat: ['toplevel'],
        ts: cpuStartTime,
        args: {
          src_file: '../../ipc/ipc_moji_bootstrap.cc',
          src_func: 'Accept',
        },
      })

      tracer.trace.completeEvent({
        name: 'EvaluateScript',
        id: ++tracer.counter,
        cat: ['devtools.timeline'],
        ts: cpuStartTime,
        dur: cpuEndTime - cpuStartTime,
        args: {
          data: {
            url: 'webpack',
            lineNumber: 1,
            columnNumber: 1,
            frame: '0xFFF',
          },
        },
      })

      tracer.trace.instantEvent({
        name: 'CpuProfile',
        id: ++tracer.counter,
        cat: ['disabled-by-default-devtools.timeline'],
        ts: cpuEndTime,
        args: {
          data: {
            cpuProfile: parsedResults.profile,
          },
        },
      })

      tracer.profiler.destroy()
      tracer.trace.flush()
      tracer.end(resolve)
    })
  }

  await telemetry.flush()
}
