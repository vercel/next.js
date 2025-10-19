import type {
  ExportPagesInput,
  ExportPageInput,
  ExportPageResult,
  ExportRouteResult,
  WorkerRenderOpts,
  ExportPagesResult,
  ExportPathEntry,
} from './types'

import '../server/node-environment'

process.env.NEXT_IS_EXPORT_WORKER = 'true'

import { extname, join, dirname, sep } from 'path'
import fs from 'fs/promises'
import { loadComponents } from '../server/load-components'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { trace } from '../trace'
import { setHttpClientAndAgentOptions } from '../server/setup-http-agent-env'
import { addRequestMeta } from '../server/request-meta'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'

import { createRequestResponseMocks } from '../server/lib/mock-request'
import { isAppRouteRoute } from '../lib/is-app-route-route'
import { hasNextSupport } from '../server/ci-info'
import { exportAppRoute } from './routes/app-route'
import { exportAppPage } from './routes/app-page'
import { exportPagesPage } from './routes/pages'
import { getParams } from './helpers/get-params'
import { createIncrementalCache } from './helpers/create-incremental-cache'
import { isPostpone } from '../server/lib/router-utils/is-postpone'
import { isDynamicUsageError } from './helpers/is-dynamic-usage-error'
import { isBailoutToCSRError } from '../shared/lib/lazy-dynamic/bailout-to-csr'
import {
  turborepoTraceAccess,
  TurborepoAccessTraceResult,
} from '../build/turborepo-access-trace'
import type { Params } from '../server/request/params'
import {
  createOpaqueFallbackRouteParams,
  type OpaqueFallbackRouteParams,
} from '../server/request/fallback-params'
import { needsExperimentalReact } from '../lib/needs-experimental-react'
import type { AppRouteRouteModule } from '../server/route-modules/app-route/module.compiled'
import { isStaticGenBailoutError } from '../client/components/static-generation-bailout'
import type { PagesRenderContext, PagesSharedContext } from '../server/render'
import type { AppSharedContext } from '../server/app-render/app-render'
import { MultiFileWriter } from '../lib/multi-file-writer'
import { createRenderResumeDataCache } from '../server/resume-data-cache/resume-data-cache'
import { installGlobalBehaviors } from '../server/node-environment-extensions/global-behaviors'
;(globalThis as any).__NEXT_DATA__ = {
  nextExport: true,
}

class TimeoutError extends Error {
  code = 'NEXT_EXPORT_TIMEOUT_ERROR'
}

class ExportPageError extends Error {
  code = 'NEXT_EXPORT_PAGE_ERROR'
}

async function exportPageImpl(
  input: ExportPageInput,
  fileWriter: MultiFileWriter
): Promise<ExportRouteResult | undefined> {
  const {
    exportPath,
    distDir,
    pagesDataDir,
    buildExport = false,
    subFolders = false,
    optimizeCss,
    disableOptimizedLoading,
    debugOutput = false,
    enableExperimentalReact,
    trailingSlash,
    sriEnabled,
    renderOpts: commonRenderOpts,
    outDir: commonOutDir,
    buildId,
    renderResumeDataCache,
  } = input

  if (enableExperimentalReact) {
    process.env.__NEXT_EXPERIMENTAL_REACT = 'true'
  }

  const {
    path,
    page,

    // The parameters that are currently unknown.
    _fallbackRouteParams = [],

    // Check if this is an `app/` page.
    _isAppDir: isAppDir = false,

    // Check if this should error when dynamic usage is detected.
    _isDynamicError: isDynamicError = false,

    // If this page supports partial prerendering, then we need to pass that to
    // the renderOpts.
    _isRoutePPREnabled: isRoutePPREnabled,

    // Configure the rendering of the page to allow that an empty static shell
    // is generated while rendering using PPR and Cache Components.
    _allowEmptyStaticShell: allowEmptyStaticShell = false,

    // Pull the original query out.
    query: originalQuery = {},
  } = exportPath

  const fallbackRouteParams: OpaqueFallbackRouteParams | null =
    createOpaqueFallbackRouteParams(_fallbackRouteParams)

  let query = { ...originalQuery }
  const pathname = normalizeAppPath(page)
  const isDynamic = isDynamicRoute(page)
  const outDir = isAppDir ? join(distDir, 'server/app') : commonOutDir

  const filePath = normalizePagePath(path)

  let updatedPath = exportPath._ssgPath || path
  let locale = exportPath._locale || commonRenderOpts.locale

  if (commonRenderOpts.locale) {
    const localePathResult = normalizeLocalePath(path, commonRenderOpts.locales)

    if (localePathResult.detectedLocale) {
      updatedPath = localePathResult.pathname
      locale = localePathResult.detectedLocale
    }
  }

  // We need to show a warning if they try to provide query values
  // for an auto-exported page since they won't be available
  const hasOrigQueryValues = Object.keys(originalQuery).length > 0

  // Check if the page is a specified dynamic route
  const { pathname: nonLocalizedPath } = normalizeLocalePath(
    path,
    commonRenderOpts.locales
  )

  let params: Params | undefined

  if (isDynamic && page !== nonLocalizedPath) {
    const normalizedPage = isAppDir ? normalizeAppPath(page) : page

    params = getParams(normalizedPage, updatedPath)
  }

  const { req, res } = createRequestResponseMocks({ url: updatedPath })

  // If this is a status code page, then set the response code.
  for (const statusCode of [404, 500]) {
    if (
      [
        `/${statusCode}`,
        `/${statusCode}.html`,
        `/${statusCode}/index.html`,
      ].some((p) => p === updatedPath || `/${locale}${p}` === updatedPath)
    ) {
      res.statusCode = statusCode
    }
  }

  // Ensure that the URL has a trailing slash if it's configured.
  if (trailingSlash && !req.url?.endsWith('/')) {
    req.url += '/'
  }

  if (
    locale &&
    buildExport &&
    commonRenderOpts.domainLocales &&
    commonRenderOpts.domainLocales.some(
      (dl) => dl.defaultLocale === locale || dl.locales?.includes(locale || '')
    )
  ) {
    addRequestMeta(req, 'isLocaleDomain', true)
  }

  const getHtmlFilename = (p: string) =>
    subFolders ? `${p}${sep}index.html` : `${p}.html`

  let htmlFilename = getHtmlFilename(filePath)

  // dynamic routes can provide invalid extensions e.g. /blog/[...slug] returns an
  // extension of `.slug]`
  const pageExt = isDynamic || isAppDir ? '' : extname(page)
  const pathExt = isDynamic || isAppDir ? '' : extname(path)

  // force output 404.html for backwards compat
  if (path === '/404.html') {
    htmlFilename = path
  }
  // Make sure page isn't a folder with a dot in the name e.g. `v1.2`
  else if (pageExt !== pathExt && pathExt !== '') {
    const isBuiltinPaths = ['/500', '/404'].some(
      (p) => p === path || p === path + '.html'
    )
    // If the ssg path has .html extension, and it's not builtin paths, use it directly
    // Otherwise, use that as the filename instead
    const isHtmlExtPath = !isBuiltinPaths && path.endsWith('.html')
    htmlFilename = isHtmlExtPath ? getHtmlFilename(path) : path
  } else if (path === '/') {
    // If the path is the root, just use index.html
    htmlFilename = 'index.html'
  }

  const baseDir = join(outDir, dirname(htmlFilename))
  let htmlFilepath = join(outDir, htmlFilename)

  await fs.mkdir(baseDir, { recursive: true })

  const components = await loadComponents({
    distDir,
    page,
    isAppPath: isAppDir,
    isDev: false,
    sriEnabled,
    needsManifestsForLegacyReasons: true,
  })

  // Handle App Routes.
  if (isAppDir && isAppRouteRoute(page)) {
    return exportAppRoute(
      req,
      res,
      params,
      page,
      components.routeModule as AppRouteRouteModule,
      commonRenderOpts.incrementalCache,
      commonRenderOpts.cacheLifeProfiles,
      htmlFilepath,
      fileWriter,
      commonRenderOpts.cacheComponents,
      commonRenderOpts.experimental,
      buildId
    )
  }

  const renderOpts: WorkerRenderOpts = {
    ...components,
    ...commonRenderOpts,
    params,
    optimizeCss,
    disableOptimizedLoading,
    locale,
    supportsDynamicResponse: false,
    // During the export phase in next build, we always enable the streaming metadata since if there's
    // any dynamic access in metadata we can determine it in the build phase.
    // If it's static, then it won't affect anything.
    // If it's dynamic, then it can be handled when request hits the route.
    serveStreamingMetadata: true,
    allowEmptyStaticShell,
    experimental: {
      ...commonRenderOpts.experimental,
      isRoutePPREnabled,
    },
    renderResumeDataCache,
  }

  // Handle App Pages
  if (isAppDir) {
    const sharedContext: AppSharedContext = { buildId }

    return exportAppPage(
      req,
      res,
      page,
      path,
      pathname,
      query,
      fallbackRouteParams,
      renderOpts,
      htmlFilepath,
      debugOutput,
      isDynamicError,
      fileWriter,
      sharedContext
    )
  }

  const sharedContext: PagesSharedContext = {
    buildId,
    deploymentId: commonRenderOpts.deploymentId,
    customServer: undefined,
  }

  const renderContext: PagesRenderContext = {
    isFallback: exportPath._pagesFallback ?? false,
    isDraftMode: false,
    developmentNotFoundSourcePage: undefined,
  }

  return exportPagesPage(
    req,
    res,
    path,
    page,
    query,
    params,
    htmlFilepath,
    htmlFilename,
    pagesDataDir,
    buildExport,
    isDynamic,
    sharedContext,
    renderContext,
    hasOrigQueryValues,
    renderOpts,
    components,
    fileWriter
  )
}

export async function exportPages(
  input: ExportPagesInput
): Promise<ExportPagesResult> {
  const {
    exportPaths,
    dir,
    distDir,
    outDir,
    cacheHandler,
    cacheMaxMemorySize,
    fetchCacheKeyPrefix,
    pagesDataDir,
    renderOpts,
    nextConfig,
    options,
    renderResumeDataCachesByPage = {},
  } = input

  installGlobalBehaviors(nextConfig)

  if (nextConfig.enablePrerenderSourceMaps) {
    try {
      // Same as `next dev`
      // Limiting the stack trace to a useful amount of frames is handled by ignore-listing.
      // TODO: How high can we go without severely impacting CPU/memory?
      Error.stackTraceLimit = 50
    } catch {}
  }

  // If the fetch cache was enabled, we need to create an incremental
  // cache instance for this page.
  const incrementalCache = await createIncrementalCache({
    cacheHandler,
    cacheMaxMemorySize,
    fetchCacheKeyPrefix,
    distDir,
    dir,
    // skip writing to disk in minimal mode for now, pending some
    // changes to better support it
    flushToDisk: !hasNextSupport,
    cacheHandlers: nextConfig.experimental.cacheHandlers,
  })

  renderOpts.incrementalCache = incrementalCache

  const maxConcurrency =
    nextConfig.experimental.staticGenerationMaxConcurrency ?? 8
  const results: ExportPagesResult = []

  const exportPageWithRetry = async (
    exportPath: ExportPathEntry,
    maxAttempts: number
  ) => {
    const { page, path } = exportPath
    const pageKey = page !== path ? `${page}: ${path}` : path
    let attempt = 0
    let result

    const hasDebuggerAttached =
      // Also tests for `inspect-brk`
      process.env.NODE_OPTIONS?.includes('--inspect')

    const renderResumeDataCache = renderResumeDataCachesByPage[page]
      ? createRenderResumeDataCache(renderResumeDataCachesByPage[page])
      : undefined

    while (attempt < maxAttempts) {
      try {
        result = await Promise.race<ExportPageResult | undefined>([
          exportPage({
            exportPath,
            distDir,
            outDir,
            pagesDataDir,
            renderOpts,
            trailingSlash: nextConfig.trailingSlash,
            subFolders: nextConfig.trailingSlash && !options.buildExport,
            buildExport: options.buildExport,
            optimizeCss: nextConfig.experimental.optimizeCss,
            disableOptimizedLoading:
              nextConfig.experimental.disableOptimizedLoading,
            parentSpanId: input.parentSpanId,
            httpAgentOptions: nextConfig.httpAgentOptions,
            debugOutput: options.debugOutput,
            enableExperimentalReact: needsExperimentalReact(nextConfig),
            sriEnabled: Boolean(nextConfig.experimental.sri?.algorithm),
            buildId: input.buildId,
            renderResumeDataCache,
          }),
          hasDebuggerAttached
            ? // With a debugger attached, exporting can take infinitely if we paused script execution.
              new Promise(() => {})
            : // If exporting the page takes longer than the timeout, reject the promise.
              new Promise((_, reject) => {
                setTimeout(() => {
                  reject(new TimeoutError())
                }, nextConfig.staticPageGenerationTimeout * 1000)
              }),
        ])

        // If there was an error in the export, throw it immediately. In the catch block, we might retry the export,
        // or immediately fail the build, depending on user configuration. We might also continue on and attempt other pages.
        if (result && 'error' in result) {
          throw new ExportPageError()
        }

        // If the export succeeds, break out of the retry loop
        break
      } catch (err) {
        // The only error that should be caught here is an ExportError, as `exportPage` doesn't throw and instead returns an object with an `error` property.
        // This is an overly cautious check to ensure that we don't accidentally catch an unexpected error.
        if (!(err instanceof ExportPageError || err instanceof TimeoutError)) {
          throw err
        }

        if (err instanceof TimeoutError) {
          // If the export times out, we will restart the worker up to 3 times.
          maxAttempts = 3
        }

        // We've reached the maximum number of attempts
        if (attempt >= maxAttempts - 1) {
          // Log a message if we've reached the maximum number of attempts.
          // We only care to do this if maxAttempts was configured.
          if (maxAttempts > 1) {
            console.info(
              `Failed to build ${pageKey} after ${maxAttempts} attempts.`
            )
          }
          // If prerenderEarlyExit is enabled, we'll exit the build immediately.
          if (nextConfig.experimental.prerenderEarlyExit) {
            console.error(
              `Export encountered an error on ${pageKey}, exiting the build.`
            )
            process.exit(1)
          } else {
            // Otherwise, this is a no-op. The build will continue, and a summary of failed pages will be displayed at the end.
          }
        } else {
          // Otherwise, we have more attempts to make. Wait before retrying
          if (err instanceof TimeoutError) {
            console.info(
              `Failed to build ${pageKey} (attempt ${attempt + 1} of ${maxAttempts}) because it took more than ${nextConfig.staticPageGenerationTimeout} seconds. Retrying again shortly.`
            )
          } else {
            console.info(
              `Failed to build ${pageKey} (attempt ${attempt + 1} of ${maxAttempts}). Retrying again shortly.`
            )
          }

          // Exponential backoff with random jitter to avoid thundering herd on retries
          const baseDelay = 500 // 500ms
          const maxDelay = 2000 // 2 seconds
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
          const jitter = Math.random() * 0.3 * delay // Add up to 30% random jitter
          await new Promise((r) => setTimeout(r, delay + jitter))
        }
      }

      attempt++
    }

    return { result, path, page, pageKey }
  }

  for (let i = 0; i < exportPaths.length; i += maxConcurrency) {
    const subset = exportPaths.slice(i, i + maxConcurrency)

    const subsetResults = await Promise.all(
      subset.map((exportPath) =>
        exportPageWithRetry(
          exportPath,
          nextConfig.experimental.staticGenerationRetryCount ?? 1
        )
      )
    )

    results.push(...subsetResults)
  }

  return results
}

async function exportPage(
  input: ExportPageInput
): Promise<ExportPageResult | undefined> {
  trace('export-page', input.parentSpanId).setAttribute(
    'path',
    input.exportPath.path
  )

  // Configure the http agent.
  setHttpClientAndAgentOptions({
    httpAgentOptions: input.httpAgentOptions,
  })

  const fileWriter = new MultiFileWriter({
    writeFile: (filePath, data) => fs.writeFile(filePath, data),
    mkdir: (dir) => fs.mkdir(dir, { recursive: true }),
  })

  const exportPageSpan = trace('export-page-worker', input.parentSpanId)

  const start = Date.now()

  const turborepoAccessTraceResult = new TurborepoAccessTraceResult()

  // Export the page.
  let result: ExportRouteResult | undefined
  try {
    result = await exportPageSpan.traceAsyncFn(() =>
      turborepoTraceAccess(
        () => exportPageImpl(input, fileWriter),
        turborepoAccessTraceResult
      )
    )

    // Wait for all the files to flush to disk.
    await fileWriter.wait()

    // If there was no result, then we can exit early.
    if (!result) return

    // If there was an error, then we can exit early.
    if ('error' in result) {
      return { error: result.error, duration: Date.now() - start }
    }
  } catch (err) {
    console.error(
      `Error occurred prerendering page "${input.exportPath.path}". Read more: https://nextjs.org/docs/messages/prerender-error`
    )

    // bailoutToCSRError errors should not leak to the user as they are not actionable; they're
    // a framework signal
    if (!isBailoutToCSRError(err)) {
      // A static generation bailout error is a framework signal to fail static generation but
      // and will encode a reason in the error message. If there is a message, we'll print it.
      // Otherwise there's nothing to show as we don't want to leak an error internal error stack to the user.
      // TODO: Always log the full error. ignore-listing will take care of hiding internal stacks.
      if (isStaticGenBailoutError(err)) {
        if (err.message) {
          console.error(`Error: ${err.message}`)
        }
      } else {
        console.error(err)
      }
    }

    return { error: true, duration: Date.now() - start }
  }

  // Notify the parent process that we processed a page (used by the progress activity indicator)
  process.send?.([3, { type: 'activity' }])

  // Otherwise we can return the result.
  return {
    ...result,
    duration: Date.now() - start,
    turborepoAccessTraceResult: turborepoAccessTraceResult.serialize(),
  }
}

process.on('unhandledRejection', (err: unknown) => {
  // if it's a postpone error, it'll be handled later
  // when the postponed promise is actually awaited.
  if (isPostpone(err)) {
    return
  }

  // we don't want to log these errors
  if (isDynamicUsageError(err)) {
    return
  }

  console.error(err)
})

process.on('rejectionHandled', () => {
  // It is ok to await a Promise late in Next.js as it allows for better
  // prefetching patterns to avoid waterfalls. We ignore logging these.
  // We should've already errored in anyway unhandledRejection.
})

const FATAL_UNHANDLED_NEXT_API_EXIT_CODE = 78

process.on('uncaughtException', (err) => {
  if (isDynamicUsageError(err)) {
    console.error(
      'A Next.js API that uses exceptions to signal framework behavior was uncaught. This suggests improper usage of a Next.js API. The original error is printed below and the build will now exit.'
    )
    console.error(err)
    process.exit(FATAL_UNHANDLED_NEXT_API_EXIT_CODE)
  } else {
    console.error(err)
  }
})
