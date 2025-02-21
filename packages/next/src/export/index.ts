import type {
  ExportAppResult,
  ExportAppOptions,
  WorkerRenderOptsPartial,
} from './types'
import { createStaticWorker, type PrerenderManifest } from '../build'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'

import { bold, yellow } from '../lib/picocolors'
import findUp from 'next/dist/compiled/find-up'
import { existsSync, promises as fs } from 'fs'

import '../server/require-hook'

import { dirname, join, resolve, sep } from 'path'
import { formatAmpMessages } from '../build/output/index'
import type { AmpPageStatus } from '../build/output/index'
import * as Log from '../build/output/log'
import { RSC_SUFFIX, SSG_FALLBACK_EXPORT_ERROR } from '../lib/constants'
import { recursiveCopy } from '../lib/recursive-copy'
import {
  BUILD_ID_FILE,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  EXPORT_DETAIL,
  EXPORT_MARKER,
  NEXT_FONT_MANIFEST,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  PHASE_EXPORT,
  PRERENDER_MANIFEST,
  SERVER_DIRECTORY,
  SERVER_REFERENCE_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  ROUTES_MANIFEST,
  FUNCTIONS_CONFIG_MANIFEST,
} from '../shared/lib/constants'
import loadConfig from '../server/config'
import type { ExportPathMap } from '../server/config-shared'
import { eventCliSession } from '../telemetry/events'
import { hasNextSupport } from '../server/ci-info'
import { Telemetry } from '../telemetry/storage'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { loadEnvConfig } from '@next/env'
import { isAPIRoute } from '../lib/is-api-route'
import { getPagePath } from '../server/require'
import type { Span } from '../trace'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import { isAppRouteRoute } from '../lib/is-app-route-route'
import { isAppPageRoute } from '../lib/is-app-page-route'
import isError from '../lib/is-error'
import { formatManifest } from '../build/manifests/formatter/format-manifest'
import { TurborepoAccessTraceResult } from '../build/turborepo-access-trace'
import { createProgress } from '../build/progress'
import type { DeepReadonly } from '../shared/lib/deep-readonly'
import { isInterceptionRouteRewrite } from '../lib/generate-interception-routes-rewrites'
import type { ActionManifest } from '../build/webpack/plugins/flight-client-entry-plugin'
import { extractInfoFromServerReferenceId } from '../shared/lib/server-reference-info'

export class ExportError extends Error {
  code = 'NEXT_EXPORT_ERROR'
}

async function exportAppImpl(
  dir: string,
  options: Readonly<ExportAppOptions>,
  span: Span
): Promise<ExportAppResult | null> {
  dir = resolve(dir)

  // attempt to load global env values so they are available in next.config.js
  span.traceChild('load-dotenv').traceFn(() => loadEnvConfig(dir, false, Log))

  const { enabledDirectories } = options

  const nextConfig =
    options.nextConfig ||
    (await span
      .traceChild('load-next-config')
      .traceAsyncFn(() => loadConfig(PHASE_EXPORT, dir)))

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
    throw new ExportError(
      `Could not find a production build in the '${distDir}' directory. Try building your app with 'next build' before starting the static export. https://nextjs.org/docs/messages/next-export-no-build-id`
    )
  }

  const customRoutes = ['rewrites', 'redirects', 'headers'].filter(
    (config) => typeof nextConfig[config] === 'function'
  )

  if (!hasNextSupport && !options.buildExport && customRoutes.length > 0) {
    Log.warn(
      `rewrites, redirects, and headers are not applied when exporting your application, detected (${customRoutes.join(
        ', '
      )}). See more info here: https://nextjs.org/docs/messages/export-no-custom-routes`
    )
  }

  const buildId = await fs.readFile(buildIdFile, 'utf8')

  const pagesManifest =
    !options.pages &&
    (require(join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST)) as PagesManifest)

  let prerenderManifest: DeepReadonly<PrerenderManifest> | undefined
  try {
    prerenderManifest = require(join(distDir, PRERENDER_MANIFEST))
  } catch {}

  let appRoutePathManifest: Record<string, string> | undefined
  try {
    appRoutePathManifest = require(join(distDir, APP_PATH_ROUTES_MANIFEST))
  } catch (err) {
    if (
      isError(err) &&
      (err.code === 'ENOENT' || err.code === 'MODULE_NOT_FOUND')
    ) {
      // the manifest doesn't exist which will happen when using
      // "pages" dir instead of "app" dir.
      appRoutePathManifest = undefined
    } else {
      // the manifest is malformed (invalid json)
      throw err
    }
  }

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

  const mapAppRouteToPage = new Map<string, string>()
  if (!options.buildExport && appRoutePathManifest) {
    for (const [pageName, routePath] of Object.entries(appRoutePathManifest)) {
      mapAppRouteToPage.set(routePath, pageName)
      if (
        isAppPageRoute(pageName) &&
        !prerenderManifest?.routes[routePath] &&
        !prerenderManifest?.dynamicRoutes[routePath]
      ) {
        defaultPathMap[routePath] = {
          page: pageName,
          _isAppDir: true,
        }
      }
    }
  }

  // Initialize the output directory
  const outDir = options.outdir

  if (outDir === join(dir, 'public')) {
    throw new ExportError(
      `The 'public' directory is reserved in Next.js and can not be used as the export out directory. https://nextjs.org/docs/messages/can-not-output-to-public`
    )
  }

  if (outDir === join(dir, 'static')) {
    throw new ExportError(
      `The 'static' directory is reserved in Next.js and can not be used as the export out directory. https://nextjs.org/docs/messages/can-not-output-to-static`
    )
  }

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(join(outDir, '_next', buildId), { recursive: true })

  await fs.writeFile(
    join(distDir, EXPORT_DETAIL),
    formatManifest({
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
    await span
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
    await span
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
    nextConfig.exportPathMap = async (defaultMap) => {
      return defaultMap
    }
  }

  const {
    i18n,
    images: { loader = 'default', unoptimized },
  } = nextConfig

  if (i18n && !options.buildExport) {
    throw new ExportError(
      `i18n support is not compatible with next export. See here for more info on deploying: https://nextjs.org/docs/messages/export-no-custom-routes`
    )
  }

  if (!options.buildExport) {
    const { isNextImageImported } = await span
      .traceChild('is-next-image-imported')
      .traceAsyncFn(() =>
        fs
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
      throw new ExportError(
        `Image Optimization using the default loader is not compatible with export.
  Possible solutions:
    - Use \`next start\` to run a server, which includes the Image Optimization API.
    - Configure \`images.unoptimized = true\` in \`next.config.js\` to disable the Image Optimization API.
  Read more: https://nextjs.org/docs/messages/export-image-api`
      )
    }
  }

  let serverActionsManifest: ActionManifest | undefined
  if (enabledDirectories.app) {
    serverActionsManifest = require(
      join(distDir, SERVER_DIRECTORY, SERVER_REFERENCE_MANIFEST + '.json')
    ) as ActionManifest

    if (nextConfig.output === 'export') {
      const routesManifest = require(join(distDir, ROUTES_MANIFEST))

      // We already prevent rewrites earlier in the process, however Next.js will insert rewrites
      // for interception routes so we need to check for that here.
      if (routesManifest?.rewrites?.beforeFiles?.length > 0) {
        const hasInterceptionRouteRewrite =
          routesManifest.rewrites.beforeFiles.some(isInterceptionRouteRewrite)

        if (hasInterceptionRouteRewrite) {
          throw new ExportError(
            `Intercepting routes are not supported with static export.\nRead more: https://nextjs.org/docs/app/building-your-application/deploying/static-exports#unsupported-features`
          )
        }
      }

      const actionIds = [
        ...Object.keys(serverActionsManifest.node),
        ...Object.keys(serverActionsManifest.edge),
      ]

      if (
        actionIds.some(
          (actionId) =>
            extractInfoFromServerReferenceId(actionId).type === 'server-action'
        )
      ) {
        throw new ExportError(
          `Server Actions are not supported with static export.\nRead more: https://nextjs.org/docs/app/building-your-application/deploying/static-exports#unsupported-features`
        )
      }
    }
  }

  // Start the rendering process
  const renderOpts: WorkerRenderOptsPartial = {
    previewProps: prerenderManifest?.preview,
    nextExport: true,
    assetPrefix: nextConfig.assetPrefix.replace(/\/$/, ''),
    distDir,
    dev: false,
    basePath: nextConfig.basePath,
    trailingSlash: nextConfig.trailingSlash,
    canonicalBase: nextConfig.amp?.canonicalBase || '',
    ampSkipValidation: nextConfig.experimental.amp?.skipValidation || false,
    ampOptimizerConfig: nextConfig.experimental.amp?.optimizer || undefined,
    locales: i18n?.locales,
    locale: i18n?.defaultLocale,
    defaultLocale: i18n?.defaultLocale,
    domainLocales: i18n?.domains,
    disableOptimizedLoading: nextConfig.experimental.disableOptimizedLoading,
    // Exported pages do not currently support dynamic HTML.
    supportsDynamicResponse: false,
    crossOrigin: nextConfig.crossOrigin,
    optimizeCss: nextConfig.experimental.optimizeCss,
    nextConfigOutput: nextConfig.output,
    nextScriptWorkers: nextConfig.experimental.nextScriptWorkers,
    largePageDataBytes: nextConfig.experimental.largePageDataBytes,
    serverActions: nextConfig.experimental.serverActions,
    serverComponents: enabledDirectories.app,
    cacheLifeProfiles: nextConfig.experimental.cacheLife,
    nextFontManifest: require(
      join(distDir, 'server', `${NEXT_FONT_MANIFEST}.json`)
    ),
    images: nextConfig.images,
    ...(enabledDirectories.app
      ? {
          serverActionsManifest,
        }
      : {}),
    strictNextHead: nextConfig.experimental.strictNextHead ?? true,
    deploymentId: nextConfig.deploymentId,
    experimental: {
      clientTraceMetadata: nextConfig.experimental.clientTraceMetadata,
      expireTime: nextConfig.expireTime,
      dynamicIO: nextConfig.experimental.dynamicIO ?? false,
      clientSegmentCache: nextConfig.experimental.clientSegmentCache ?? false,
      inlineCss: nextConfig.experimental.inlineCss ?? false,
      authInterrupts: !!nextConfig.experimental.authInterrupts,
      streamingMetadata: !!nextConfig.experimental.streamingMetadata,
      htmlLimitedBots: nextConfig.experimental.htmlLimitedBots,
    },
    reactMaxHeadersLength: nextConfig.reactMaxHeadersLength,
  }

  const { publicRuntimeConfig } = nextConfig

  if (Object.keys(publicRuntimeConfig).length > 0) {
    renderOpts.runtimeConfig = publicRuntimeConfig
  }

  // We need this for server rendering the Link component.
  ;(globalThis as any).__NEXT_DATA__ = {
    nextExport: true,
  }

  const exportPathMap = await span
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
    (route) =>
      exportPathMap[route]._isAppDir ||
      // Remove API routes
      !isAPIRoute(exportPathMap[route].page)
  )

  if (filteredPaths.length !== exportPaths.length) {
    hasApiRoutes = true
  }

  if (filteredPaths.length === 0) {
    return null
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

    if (fallbackEnabledPages.size > 0) {
      throw new ExportError(
        `Found pages with \`fallback\` enabled:\n${[
          ...fallbackEnabledPages,
        ].join('\n')}\n${SSG_FALLBACK_EXPORT_ERROR}\n`
      )
    }
  }
  let hasMiddleware = false

  if (!options.buildExport) {
    try {
      const middlewareManifest = require(
        join(distDir, SERVER_DIRECTORY, MIDDLEWARE_MANIFEST)
      ) as MiddlewareManifest

      const functionsConfigManifest = require(
        join(distDir, SERVER_DIRECTORY, FUNCTIONS_CONFIG_MANIFEST)
      )

      hasMiddleware =
        Object.keys(middlewareManifest.middleware).length > 0 ||
        Boolean(functionsConfigManifest.functions?.['/_middleware'])
    } catch {}

    // Warn if the user defines a path for an API page
    if (hasApiRoutes || hasMiddleware) {
      if (nextConfig.output === 'export') {
        Log.warn(
          yellow(
            `Statically exporting a Next.js application via \`next export\` disables API routes and middleware.`
          ) +
            `\n` +
            yellow(
              `This command is meant for static-only hosts, and is` +
                ' ' +
                bold(`not necessary to make your application static.`)
            ) +
            `\n` +
            yellow(
              `Pages in your application without server-side data dependencies will be automatically statically exported by \`next build\`, including pages powered by \`getStaticProps\`.`
            ) +
            `\n` +
            yellow(
              `Learn more: https://nextjs.org/docs/messages/api-routes-static-export`
            )
        )
      }
    }
  }

  const pagesDataDir = options.buildExport
    ? outDir
    : join(outDir, '_next/data', buildId)

  const ampValidations: AmpPageStatus = {}

  const publicDir = join(dir, CLIENT_PUBLIC_FILES_PATH)
  // Copy public directory
  if (!options.buildExport && existsSync(publicDir)) {
    if (!options.silent) {
      Log.info('Copying "public" directory')
    }
    await span.traceChild('copy-public-directory').traceAsyncFn(() =>
      recursiveCopy(publicDir, outDir, {
        filter(path) {
          // Exclude paths used by pages
          return !exportPathMap[path]
        },
      })
    )
  }

  const failedExportAttemptsByPage: Map<string, boolean> = new Map()

  // Chunk filtered pages into smaller groups, and call the export worker on each group.
  // We've set a default minimum of 25 pages per chunk to ensure that even setups
  // with only a few static pages can leverage a shared incremental cache, however this
  // value can be configured.
  const minChunkSize =
    nextConfig.experimental.staticGenerationMinPagesPerWorker ?? 25
  // Calculate the number of workers needed to ensure each chunk has at least minChunkSize pages
  const numWorkers = Math.min(
    options.numWorkers,
    Math.ceil(filteredPaths.length / minChunkSize)
  )
  // Calculate the chunk size based on the number of workers
  const chunkSize = Math.ceil(filteredPaths.length / numWorkers)
  const chunks = Array.from({ length: numWorkers }, (_, i) =>
    filteredPaths.slice(i * chunkSize, (i + 1) * chunkSize)
  )
  // Distribute remaining pages
  const remainingPages = filteredPaths.slice(numWorkers * chunkSize)
  remainingPages.forEach((page, index) => {
    chunks[index % chunks.length].push(page)
  })

  const progress = createProgress(
    filteredPaths.length,
    options.statusMessage || 'Exporting'
  )

  const worker = createStaticWorker(nextConfig, progress)

  const results = (
    await Promise.all(
      chunks.map((paths) =>
        worker.exportPages({
          buildId,
          paths,
          exportPathMap,
          parentSpanId: span.getId(),
          pagesDataDir,
          renderOpts,
          options,
          dir,
          distDir,
          outDir,
          nextConfig,
          cacheHandler: nextConfig.cacheHandler,
          cacheMaxMemorySize: nextConfig.cacheMaxMemorySize,
          fetchCache: true,
          fetchCacheKeyPrefix: nextConfig.experimental.fetchCacheKeyPrefix,
        })
      )
    )
  ).flat()

  let hadValidationError = false

  const collector: ExportAppResult = {
    byPath: new Map(),
    byPage: new Map(),
    ssgNotFoundPaths: new Set(),
    turborepoAccessTraceResults: new Map(),
  }

  for (const { result, path, pageKey } of results) {
    if (!result) continue
    if ('error' in result) {
      failedExportAttemptsByPage.set(pageKey, true)
      continue
    }

    const { page } = exportPathMap[path]

    if (result.turborepoAccessTraceResult) {
      collector.turborepoAccessTraceResults?.set(
        path,
        TurborepoAccessTraceResult.fromSerialized(
          result.turborepoAccessTraceResult
        )
      )
    }

    // Capture any amp validations.
    if (result.ampValidations) {
      for (const validation of result.ampValidations) {
        ampValidations[validation.page] = validation.result
        hadValidationError ||= validation.result.errors.length > 0
      }
    }

    if (options.buildExport) {
      // Update path info by path.
      const info = collector.byPath.get(path) ?? {}
      if (typeof result.revalidate !== 'undefined') {
        info.revalidate = result.revalidate
      }
      if (typeof result.metadata !== 'undefined') {
        info.metadata = result.metadata
      }

      if (typeof result.hasEmptyPrelude !== 'undefined') {
        info.hasEmptyPrelude = result.hasEmptyPrelude
      }

      if (typeof result.hasPostponed !== 'undefined') {
        info.hasPostponed = result.hasPostponed
      }

      if (typeof result.fetchMetrics !== 'undefined') {
        info.fetchMetrics = result.fetchMetrics
      }

      collector.byPath.set(path, info)

      // Update not found.
      if (result.ssgNotFound === true) {
        collector.ssgNotFoundPaths.add(path)
      }

      // Update durations.
      const durations = collector.byPage.get(page) ?? {
        durationsByPath: new Map<string, number>(),
      }
      durations.durationsByPath.set(path, result.duration)
      collector.byPage.set(page, durations)
    }
  }

  // Export mode provide static outputs that are not compatible with PPR mode.
  if (!options.buildExport && nextConfig.experimental.ppr) {
    // TODO: add message
    throw new Error('Invariant: PPR cannot be enabled in export mode')
  }

  // copy prerendered routes to outDir
  if (!options.buildExport && prerenderManifest) {
    await Promise.all(
      Object.keys(prerenderManifest.routes).map(async (route) => {
        const { srcRoute } = prerenderManifest!.routes[route]
        const appPageName = mapAppRouteToPage.get(srcRoute || '')
        const pageName = appPageName || srcRoute || route
        const isAppPath = Boolean(appPageName)
        const isAppRouteHandler = appPageName && isAppRouteRoute(appPageName)

        // returning notFound: true from getStaticProps will not
        // output html/json files during the build
        if (prerenderManifest!.notFoundRoutes.includes(route)) {
          return
        }
        route = normalizePagePath(route)

        const pagePath = getPagePath(pageName, distDir, undefined, isAppPath)
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
        const handlerSrc = `${orig}.body`
        const handlerDest = join(outDir, route)

        if (isAppRouteHandler && existsSync(handlerSrc)) {
          await fs.mkdir(dirname(handlerDest), { recursive: true })
          await fs.copyFile(handlerSrc, handlerDest)
          return
        }

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
        const jsonDest = isAppPath
          ? join(
              outDir,
              `${route}${
                subFolders && route !== '/index' ? `${sep}index` : ''
              }.txt`
            )
          : join(pagesDataDir, `${route}.json`)

        await fs.mkdir(dirname(htmlDest), { recursive: true })
        await fs.mkdir(dirname(jsonDest), { recursive: true })

        const htmlSrc = `${orig}.html`
        const jsonSrc = `${orig}${isAppPath ? RSC_SUFFIX : '.json'}`

        await fs.copyFile(htmlSrc, htmlDest)
        await fs.copyFile(jsonSrc, jsonDest)

        if (existsSync(`${orig}.amp.html`)) {
          await fs.mkdir(dirname(ampHtmlDest), { recursive: true })
          await fs.copyFile(`${orig}.amp.html`, ampHtmlDest)
        }
      })
    )
  }

  if (Object.keys(ampValidations).length) {
    console.log(formatAmpMessages(ampValidations))
  }
  if (hadValidationError) {
    throw new ExportError(
      `AMP Validation caused the export to fail. https://nextjs.org/docs/messages/amp-export-validation`
    )
  }

  if (failedExportAttemptsByPage.size > 0) {
    const failedPages = Array.from(failedExportAttemptsByPage.keys())
    throw new ExportError(
      `Export encountered errors on following paths:\n\t${failedPages
        .sort()
        .join('\n\t')}`
    )
  }

  await fs.writeFile(
    join(distDir, EXPORT_DETAIL),
    formatManifest({
      version: 1,
      outDirectory: outDir,
      success: true,
    }),
    'utf8'
  )

  if (telemetry) {
    await telemetry.flush()
  }

  await worker.end()

  return collector
}

export default async function exportApp(
  dir: string,
  options: ExportAppOptions,
  span: Span
): Promise<ExportAppResult | null> {
  const nextExportSpan = span.traceChild('next-export')

  return nextExportSpan.traceAsyncFn(async () => {
    return await exportAppImpl(dir, options, nextExportSpan)
  })
}
