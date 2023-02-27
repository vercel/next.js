import chalk from 'next/dist/compiled/chalk'
import findUp from 'next/dist/compiled/find-up'
import {
  promises,
  existsSync,
  exists as existsOrig,
  readFileSync,
  writeFileSync,
} from 'fs'
import { Worker } from '../lib/worker'
import { dirname, join, resolve, sep } from 'path'
import { promisify } from 'util'
import { AmpPageStatus, formatAmpMessages } from '../build/output/index'
import * as Log from '../build/output/log'
import createSpinner from '../build/spinner'
import { SSG_FALLBACK_EXPORT_ERROR } from '../lib/constants'
import { recursiveCopy } from '../lib/recursive-copy'
import { recursiveDelete } from '../lib/recursive-delete'
import {
  BUILD_ID_FILE,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  EXPORT_DETAIL,
  EXPORT_MARKER,
  CLIENT_REFERENCE_MANIFEST,
  FLIGHT_SERVER_CSS_MANIFEST,
  FONT_LOADER_MANIFEST,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  PHASE_EXPORT,
  PRERENDER_MANIFEST,
  SERVER_DIRECTORY,
  SERVER_REFERENCE_MANIFEST,
} from '../shared/lib/constants'
import loadConfig from '../server/config'
import { ExportPathMap, NextConfigComplete } from '../server/config-shared'
import { eventCliSession } from '../telemetry/events'
import { hasNextSupport } from '../telemetry/ci-info'
import { Telemetry } from '../telemetry/storage'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { loadEnvConfig } from '@next/env'
import { PrerenderManifest } from '../build'
import { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import { isAPIRoute } from '../lib/is-api-route'
import { getPagePath } from '../server/require'
import { Span } from '../trace'
import { FontConfig } from '../server/font-utils'
import {
  loadRequireHook,
  overrideBuiltInReactPackages,
} from '../build/webpack/require-hook'
import { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'

loadRequireHook()
if (process.env.NEXT_PREBUNDLED_REACT) {
  overrideBuiltInReactPackages()
}

const exists = promisify(existsOrig)

function divideSegments(number: number, segments: number): number[] {
  const result = []
  while (number > 0 && segments > 0) {
    const dividedNumber =
      number < segments ? number : Math.floor(number / segments)

    number -= dividedNumber
    segments--
    result.push(dividedNumber)
  }
  return result
}

const createProgress = (total: number, label: string) => {
  const segments = divideSegments(total, 4)

  if (total === 0) {
    throw new Error('invariant: progress total can not be zero')
  }
  let currentSegmentTotal = segments.shift()
  let currentSegmentCount = 0
  let lastProgressOutput = Date.now()
  let curProgress = 0
  let progressSpinner = createSpinner(`${label} (${curProgress}/${total})`, {
    spinner: {
      frames: [
        '[    ]',
        '[=   ]',
        '[==  ]',
        '[=== ]',
        '[ ===]',
        '[  ==]',
        '[   =]',
        '[    ]',
        '[   =]',
        '[  ==]',
        '[ ===]',
        '[====]',
        '[=== ]',
        '[==  ]',
        '[=   ]',
      ],
      interval: 500,
    },
  })

  return () => {
    curProgress++

    // Make sure we only log once
    // - per fully generated segment, or
    // - per minute
    // when not showing the spinner
    if (!progressSpinner) {
      currentSegmentCount++

      if (currentSegmentCount === currentSegmentTotal) {
        currentSegmentTotal = segments.shift()
        currentSegmentCount = 0
      } else if (lastProgressOutput + 60000 > Date.now()) {
        return
      }

      lastProgressOutput = Date.now()
    }

    const newText = `${label} (${curProgress}/${total})`
    if (progressSpinner) {
      progressSpinner.text = newText
    } else {
      console.log(newText)
    }

    if (curProgress === total && progressSpinner) {
      progressSpinner.stop()
      console.log(newText)
    }
  }
}

interface ExportOptions {
  outdir: string
  silent?: boolean
  threads?: number
  debugOutput?: boolean
  pages?: string[]
  buildExport?: boolean
  statusMessage?: string
  exportPageWorker?: typeof import('./worker').default
  endWorker?: () => Promise<void>
  appPaths?: string[]
}

export default async function exportApp(
  dir: string,
  options: ExportOptions,
  span: Span,
  configuration?: NextConfigComplete
): Promise<void> {
  const nextExportSpan = span.traceChild('next-export')
  const hasAppDir = !!options.appPaths

  return nextExportSpan.traceAsyncFn(async () => {
    dir = resolve(dir)

    // attempt to load global env values so they are available in next.config.js
    nextExportSpan
      .traceChild('load-dotenv')
      .traceFn(() => loadEnvConfig(dir, false, Log))

    const nextConfig =
      configuration ||
      (await nextExportSpan
        .traceChild('load-next-config')
        .traceAsyncFn(() => loadConfig(PHASE_EXPORT, dir)))
    const threads = options.threads || nextConfig.experimental.cpus
    const distDir = join(dir, nextConfig.distDir)

    const telemetry = options.buildExport ? null : new Telemetry({ distDir })

    if (telemetry) {
      telemetry.record(
        eventCliSession(distDir, nextConfig, {
          webpackVersion: null,
          cliCommand: 'export',
          isSrcDir: null,
          hasNowJson: !!(await findUp('now.json', { cwd: dir })),
          isCustomServer: null,
          turboFlag: false,
          pagesDir: null,
          appDir: null,
        })
      )
    }

    const subFolders = nextConfig.trailingSlash && !options.buildExport

    if (!options.silent && !options.buildExport) {
      Log.info(`using build directory: ${distDir}`)
    }

    const buildIdFile = join(distDir, BUILD_ID_FILE)

    if (!existsSync(buildIdFile)) {
      throw new Error(
        `Could not find a production build in the '${distDir}' directory. Try building your app with 'next build' before starting the static export. https://nextjs.org/docs/messages/next-export-no-build-id`
      )
    }

    const customRoutesDetected = ['rewrites', 'redirects', 'headers'].filter(
      (config) => typeof nextConfig[config] === 'function'
    )

    if (
      !hasNextSupport &&
      !options.buildExport &&
      customRoutesDetected.length > 0
    ) {
      Log.warn(
        `rewrites, redirects, and headers are not applied when exporting your application, detected (${customRoutesDetected.join(
          ', '
        )}). See more info here: https://nextjs.org/docs/messages/export-no-custom-routes`
      )
    }

    const buildId = readFileSync(buildIdFile, 'utf8')
    const pagesManifest =
      !options.pages &&
      (require(join(
        distDir,
        SERVER_DIRECTORY,
        PAGES_MANIFEST
      )) as PagesManifest)

    let prerenderManifest: PrerenderManifest | undefined = undefined
    try {
      prerenderManifest = require(join(distDir, PRERENDER_MANIFEST))
    } catch (_) {}

    const excludedPrerenderRoutes = new Set<string>()
    const pages = options.pages || Object.keys(pagesManifest)
    const defaultPathMap: ExportPathMap = {}
    let hasApiRoutes = false

    for (const page of pages) {
      // _document and _app are not real pages
      // _error is exported as 404.html later on
      // API Routes are Node.js functions

      if (isAPIRoute(page)) {
        hasApiRoutes = true
        continue
      }

      if (page === '/_document' || page === '/_app' || page === '/_error') {
        continue
      }

      // iSSG pages that are dynamic should not export templated version by
      // default. In most cases, this would never work. There is no server that
      // could run `getStaticProps`. If users make their page work lazily, they
      // can manually add it to the `exportPathMap`.
      if (prerenderManifest?.dynamicRoutes[page]) {
        excludedPrerenderRoutes.add(page)
        continue
      }

      defaultPathMap[page] = { page }
    }

    // Initialize the output directory
    const outDir = options.outdir

    if (outDir === join(dir, 'public')) {
      throw new Error(
        `The 'public' directory is reserved in Next.js and can not be used as the export out directory. https://nextjs.org/docs/messages/can-not-output-to-public`
      )
    }

    if (outDir === join(dir, 'static')) {
      throw new Error(
        `The 'static' directory is reserved in Next.js and can not be used as the export out directory. https://nextjs.org/docs/messages/can-not-output-to-static`
      )
    }

    await recursiveDelete(join(outDir))
    await promises.mkdir(join(outDir, '_next', buildId), { recursive: true })

    writeFileSync(
      join(distDir, EXPORT_DETAIL),
      JSON.stringify({
        version: 1,
        outDirectory: outDir,
        success: false,
      }),
      'utf8'
    )

    // Copy static directory
    if (!options.buildExport && existsSync(join(dir, 'static'))) {
      if (!options.silent) {
        Log.info('Copying "static" directory')
      }
      await nextExportSpan
        .traceChild('copy-static-directory')
        .traceAsyncFn(() =>
          recursiveCopy(join(dir, 'static'), join(outDir, 'static'))
        )
    }

    // Copy .next/static directory
    if (
      !options.buildExport &&
      existsSync(join(distDir, CLIENT_STATIC_FILES_PATH))
    ) {
      if (!options.silent) {
        Log.info('Copying "static build" directory')
      }
      await nextExportSpan
        .traceChild('copy-next-static-directory')
        .traceAsyncFn(() =>
          recursiveCopy(
            join(distDir, CLIENT_STATIC_FILES_PATH),
            join(outDir, '_next', CLIENT_STATIC_FILES_PATH)
          )
        )
    }

    // Get the exportPathMap from the config file
    if (typeof nextConfig.exportPathMap !== 'function') {
      if (!options.silent) {
        Log.info(
          `No "exportPathMap" found in "${nextConfig.configFile}". Generating map from "./pages"`
        )
      }
      nextConfig.exportPathMap = async (defaultMap) => {
        return defaultMap
      }
    }

    const {
      i18n,
      images: { loader = 'default', unoptimized },
    } = nextConfig

    if (i18n && !options.buildExport) {
      throw new Error(
        `i18n support is not compatible with next export. See here for more info on deploying: https://nextjs.org/docs/deployment`
      )
    }

    if (!options.buildExport) {
      const { isNextImageImported } = await nextExportSpan
        .traceChild('is-next-image-imported')
        .traceAsyncFn(() =>
          promises
            .readFile(join(distDir, EXPORT_MARKER), 'utf8')
            .then((text) => JSON.parse(text))
            .catch(() => ({}))
        )

      if (
        isNextImageImported &&
        loader === 'default' &&
        !unoptimized &&
        !hasNextSupport
      ) {
        throw new Error(
          `Image Optimization using Next.js' default loader is not compatible with \`next export\`.
  Possible solutions:
    - Use \`next start\` to run a server, which includes the Image Optimization API.
    - Configure \`images.unoptimized = true\` in \`next.config.js\` to disable the Image Optimization API.
  Read more: https://nextjs.org/docs/messages/export-image-api`
        )
      }
    }

    // Start the rendering process
    const renderOpts = {
      dir,
      buildId,
      nextExport: true,
      assetPrefix: nextConfig.assetPrefix.replace(/\/$/, ''),
      distDir,
      dev: false,
      hotReloader: null,
      basePath: nextConfig.basePath,
      canonicalBase: nextConfig.amp?.canonicalBase || '',
      ampValidatorPath: nextConfig.experimental.amp?.validator || undefined,
      ampSkipValidation: nextConfig.experimental.amp?.skipValidation || false,
      ampOptimizerConfig: nextConfig.experimental.amp?.optimizer || undefined,
      locales: i18n?.locales,
      locale: i18n?.defaultLocale,
      defaultLocale: i18n?.defaultLocale,
      domainLocales: i18n?.domains,
      trailingSlash: nextConfig.trailingSlash,
      disableOptimizedLoading: nextConfig.experimental.disableOptimizedLoading,
      // Exported pages do not currently support dynamic HTML.
      supportsDynamicHTML: false,
      runtime: nextConfig.experimental.runtime,
      crossOrigin: nextConfig.crossOrigin,
      optimizeCss: nextConfig.experimental.optimizeCss,
      nextScriptWorkers: nextConfig.experimental.nextScriptWorkers,
      optimizeFonts: nextConfig.optimizeFonts as FontConfig,
      largePageDataBytes: nextConfig.experimental.largePageDataBytes,
      serverComponents: hasAppDir,
      fontLoaderManifest: require(join(
        distDir,
        'server',
        `${FONT_LOADER_MANIFEST}.json`
      )),
    }

    const { serverRuntimeConfig, publicRuntimeConfig } = nextConfig

    if (Object.keys(publicRuntimeConfig).length > 0) {
      ;(renderOpts as any).runtimeConfig = publicRuntimeConfig
    }

    // We need this for server rendering the Link component.
    ;(globalThis as any).__NEXT_DATA__ = {
      nextExport: true,
    }

    if (!options.silent && !options.buildExport) {
      Log.info(`Launching ${threads} workers`)
    }
    const exportPathMap = await nextExportSpan
      .traceChild('run-export-path-map')
      .traceAsyncFn(async () => {
        const exportMap = await nextConfig.exportPathMap(defaultPathMap, {
          dev: false,
          dir,
          outDir,
          distDir,
          buildId,
        })
        return exportMap
      })

    if (options.buildExport && hasAppDir) {
      // @ts-expect-error untyped
      renderOpts.serverComponentManifest = require(join(
        distDir,
        SERVER_DIRECTORY,
        CLIENT_REFERENCE_MANIFEST + '.json'
      )) as PagesManifest
      // @ts-expect-error untyped
      renderOpts.serverCSSManifest = require(join(
        distDir,
        SERVER_DIRECTORY,
        FLIGHT_SERVER_CSS_MANIFEST + '.json'
      )) as PagesManifest
      // @ts-expect-error untyped
      renderOpts.serverActionsManifest = require(join(
        distDir,
        SERVER_DIRECTORY,
        SERVER_REFERENCE_MANIFEST + '.json'
      )) as PagesManifest
    }

    // only add missing 404 page when `buildExport` is false
    if (!options.buildExport) {
      // only add missing /404 if not specified in `exportPathMap`
      if (!exportPathMap['/404']) {
        exportPathMap['/404'] = { page: '/_error' }
      }

      /**
       * exports 404.html for backwards compat
       * E.g. GitHub Pages, GitLab Pages, Cloudflare Pages, Netlify
       */
      if (!exportPathMap['/404.html']) {
        // alias /404.html to /404 to be compatible with custom 404 / _error page
        exportPathMap['/404.html'] = exportPathMap['/404']
      }
    }

    // make sure to prevent duplicates
    const exportPaths = [
      ...new Set(
        Object.keys(exportPathMap).map((path) =>
          denormalizePagePath(normalizePagePath(path))
        )
      ),
    ]

    const filteredPaths = exportPaths.filter(
      // Remove API routes
      (route) =>
        (exportPathMap[route] as any)._isAppDir ||
        !isAPIRoute(exportPathMap[route].page)
    )

    if (filteredPaths.length !== exportPaths.length) {
      hasApiRoutes = true
    }

    if (filteredPaths.length === 0) {
      return
    }

    if (prerenderManifest && !options.buildExport) {
      const fallbackEnabledPages = new Set()

      for (const path of Object.keys(exportPathMap)) {
        const page = exportPathMap[path].page
        const prerenderInfo = prerenderManifest.dynamicRoutes[page]

        if (prerenderInfo && prerenderInfo.fallback !== false) {
          fallbackEnabledPages.add(page)
        }
      }

      if (fallbackEnabledPages.size) {
        throw new Error(
          `Found pages with \`fallback\` enabled:\n${[
            ...fallbackEnabledPages,
          ].join('\n')}\n${SSG_FALLBACK_EXPORT_ERROR}\n`
        )
      }
    }
    let hasMiddleware = false

    if (!options.buildExport) {
      try {
        const middlewareManifest = require(join(
          distDir,
          SERVER_DIRECTORY,
          MIDDLEWARE_MANIFEST
        )) as MiddlewareManifest

        hasMiddleware = Object.keys(middlewareManifest.middleware).length > 0
      } catch (_) {}

      // Warn if the user defines a path for an API page
      if (hasApiRoutes || hasMiddleware) {
        if (!options.silent) {
          Log.warn(
            chalk.yellow(
              `Statically exporting a Next.js application via \`next export\` disables API routes and middleware.`
            ) +
              `\n` +
              chalk.yellow(
                `This command is meant for static-only hosts, and is` +
                  ' ' +
                  chalk.bold(`not necessary to make your application static.`)
              ) +
              `\n` +
              chalk.yellow(
                `Pages in your application without server-side data dependencies will be automatically statically exported by \`next build\`, including pages powered by \`getStaticProps\`.`
              ) +
              `\n` +
              chalk.yellow(
                `Learn more: https://nextjs.org/docs/messages/api-routes-static-export`
              )
          )
        }
      }
    }

    const progress =
      !options.silent &&
      createProgress(
        filteredPaths.length,
        `${Log.prefixes.info} ${options.statusMessage || 'Exporting'}`
      )
    const pagesDataDir = options.buildExport
      ? outDir
      : join(outDir, '_next/data', buildId)

    const ampValidations: AmpPageStatus = {}
    let hadValidationError = false

    const publicDir = join(dir, CLIENT_PUBLIC_FILES_PATH)
    // Copy public directory
    if (!options.buildExport && existsSync(publicDir)) {
      if (!options.silent) {
        Log.info('Copying "public" directory')
      }
      await nextExportSpan
        .traceChild('copy-public-directory')
        .traceAsyncFn(() =>
          recursiveCopy(publicDir, outDir, {
            filter(path) {
              // Exclude paths used by pages
              return !exportPathMap[path]
            },
          })
        )
    }

    const timeout = configuration?.staticPageGenerationTimeout || 0
    let infoPrinted = false
    let exportPage: typeof import('./worker').default
    let endWorker: () => Promise<void>
    if (options.exportPageWorker) {
      exportPage = options.exportPageWorker
      endWorker = options.endWorker || (() => Promise.resolve())
    } else {
      const worker = new Worker(require.resolve('./worker'), {
        timeout: timeout * 1000,
        onRestart: (_method, [{ path }], attempts) => {
          if (attempts >= 3) {
            throw new Error(
              `Static page generation for ${path} is still timing out after 3 attempts. See more info here https://nextjs.org/docs/messages/static-page-generation-timeout`
            )
          }
          Log.warn(
            `Restarted static page generation for ${path} because it took more than ${timeout} seconds`
          )
          if (!infoPrinted) {
            Log.warn(
              'See more info here https://nextjs.org/docs/messages/static-page-generation-timeout'
            )
            infoPrinted = true
          }
        },
        maxRetries: 0,
        numWorkers: threads,
        enableWorkerThreads: nextConfig.experimental.workerThreads,
        exposedMethods: ['default'],
      }) as Worker & typeof import('./worker')
      exportPage = worker.default.bind(worker)
      endWorker = async () => {
        await worker.end()
      }
    }

    let renderError = false
    const errorPaths: string[] = []

    await Promise.all(
      filteredPaths.map(async (path) => {
        const pageExportSpan = nextExportSpan.traceChild('export-page')
        pageExportSpan.setAttribute('path', path)

        return pageExportSpan.traceAsyncFn(async () => {
          const pathMap = exportPathMap[path]
          const result = await exportPage({
            path,
            pathMap,
            distDir,
            outDir,
            pagesDataDir,
            renderOpts,
            serverRuntimeConfig,
            subFolders,
            buildExport: options.buildExport,
            optimizeFonts: nextConfig.optimizeFonts as FontConfig,
            optimizeCss: nextConfig.experimental.optimizeCss,
            disableOptimizedLoading:
              nextConfig.experimental.disableOptimizedLoading,
            parentSpanId: pageExportSpan.id,
            httpAgentOptions: nextConfig.httpAgentOptions,
            serverComponents: hasAppDir,
            appPaths: options.appPaths || [],
            enableUndici: nextConfig.experimental.enableUndici,
            debugOutput: options.debugOutput,
            isrMemoryCacheSize: nextConfig.experimental.isrMemoryCacheSize,
            fetchCache: nextConfig.experimental.appDir,
            incrementalCacheHandlerPath:
              nextConfig.experimental.incrementalCacheHandlerPath,
          })

          for (const validation of result.ampValidations || []) {
            const { page, result: ampValidationResult } = validation
            ampValidations[page] = ampValidationResult
            hadValidationError =
              hadValidationError ||
              (Array.isArray(ampValidationResult?.errors) &&
                ampValidationResult.errors.length > 0)
          }
          renderError = renderError || !!result.error
          if (!!result.error) {
            const { page } = pathMap
            errorPaths.push(page !== path ? `${page}: ${path}` : path)
          }

          if (options.buildExport && configuration) {
            if (typeof result.fromBuildExportRevalidate !== 'undefined') {
              configuration.initialPageRevalidationMap[path] =
                result.fromBuildExportRevalidate
            }

            if (typeof result.fromBuildExportMeta !== 'undefined') {
              configuration.initialPageMetaMap[path] =
                result.fromBuildExportMeta
            }

            if (result.ssgNotFound === true) {
              configuration.ssgNotFoundPaths.push(path)
            }

            const durations = (configuration.pageDurationMap[pathMap.page] =
              configuration.pageDurationMap[pathMap.page] || {})
            durations[path] = result.duration
          }

          if (progress) progress()
        })
      })
    )

    const endWorkerPromise = endWorker()

    // copy prerendered routes to outDir
    if (!options.buildExport && prerenderManifest) {
      await Promise.all(
        Object.keys(prerenderManifest.routes).map(async (route) => {
          const { srcRoute } = prerenderManifest!.routes[route]
          const pageName = srcRoute || route

          // returning notFound: true from getStaticProps will not
          // output html/json files during the build
          if (prerenderManifest!.notFoundRoutes.includes(route)) {
            return
          }
          route = normalizePagePath(route)

          const pagePath = getPagePath(pageName, distDir)
          const distPagesDir = join(
            pagePath,
            // strip leading / and then recurse number of nested dirs
            // to place from base folder
            pageName
              .slice(1)
              .split('/')
              .map(() => '..')
              .join('/')
          )

          const orig = join(distPagesDir, route)
          const htmlDest = join(
            outDir,
            `${route}${
              subFolders && route !== '/index' ? `${sep}index` : ''
            }.html`
          )
          const ampHtmlDest = join(
            outDir,
            `${route}.amp${subFolders ? `${sep}index` : ''}.html`
          )
          const jsonDest = join(pagesDataDir, `${route}.json`)

          await promises.mkdir(dirname(htmlDest), { recursive: true })
          await promises.mkdir(dirname(jsonDest), { recursive: true })

          const htmlSrc = `${orig}.html`
          const jsonSrc = `${orig}.json`

          await promises.copyFile(htmlSrc, htmlDest)
          await promises.copyFile(jsonSrc, jsonDest)

          if (await exists(`${orig}.amp.html`)) {
            await promises.mkdir(dirname(ampHtmlDest), { recursive: true })
            await promises.copyFile(`${orig}.amp.html`, ampHtmlDest)
          }
        })
      )
    }

    if (Object.keys(ampValidations).length) {
      console.log(formatAmpMessages(ampValidations))
    }
    if (hadValidationError) {
      throw new Error(
        `AMP Validation caused the export to fail. https://nextjs.org/docs/messages/amp-export-validation`
      )
    }

    if (renderError) {
      throw new Error(
        `Export encountered errors on following paths:\n\t${errorPaths
          .sort()
          .join('\n\t')}`
      )
    }

    writeFileSync(
      join(distDir, EXPORT_DETAIL),
      JSON.stringify({
        version: 1,
        outDirectory: outDir,
        success: true,
      }),
      'utf8'
    )

    if (telemetry) {
      await telemetry.flush()
    }

    await endWorkerPromise
  })
}
