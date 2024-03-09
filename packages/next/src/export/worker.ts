import type {
  ExportPageInput,
  ExportPageResult,
  ExportRouteResult,
  ExportedPageFile,
  FileWriter,
  WorkerRenderOpts,
} from './types'

import '../server/node-environment'

process.env.NEXT_IS_EXPORT_WORKER = 'true'

import { extname, join, dirname, sep } from 'path'
import fs from 'fs/promises'
import { loadComponents } from '../server/load-components'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { requireFontManifest } from '../server/require'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { trace } from '../trace'
import { setHttpClientAndAgentOptions } from '../server/setup-http-agent-env'
import isError from '../lib/is-error'
import { addRequestMeta } from '../server/request-meta'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'

import { createRequestResponseMocks } from '../server/lib/mock-request'
import { isAppRouteRoute } from '../lib/is-app-route-route'
import { hasNextSupport } from '../telemetry/ci-info'
import { exportAppRoute } from './routes/app-route'
import { exportAppPage } from './routes/app-page'
import { exportPages } from './routes/pages'
import { getParams } from './helpers/get-params'
import { createIncrementalCache } from './helpers/create-incremental-cache'
import { isPostpone } from '../server/lib/router-utils/is-postpone'
import { isDynamicUsageError } from './helpers/is-dynamic-usage-error'
import { isBailoutToCSRError } from '../shared/lib/lazy-dynamic/bailout-to-csr'
import {
  turborepoTraceAccess,
  TurborepoAccessTraceResult,
} from '../build/turborepo-access-trace'

const envConfig = require('../shared/lib/runtime-config.external')

;(globalThis as any).__NEXT_DATA__ = {
  nextExport: true,
}

async function exportPageImpl(
  input: ExportPageInput,
  fileWriter: FileWriter
): Promise<ExportRouteResult | undefined> {
  const {
    dir,
    path,
    pathMap,
    distDir,
    pagesDataDir,
    buildExport = false,
    serverRuntimeConfig,
    subFolders = false,
    optimizeFonts,
    optimizeCss,
    disableOptimizedLoading,
    debugOutput = false,
    cacheMaxMemorySize,
    fetchCache,
    fetchCacheKeyPrefix,
    cacheHandler,
    enableExperimentalReact,
    ampValidatorPath,
    trailingSlash,
    enabledDirectories,
  } = input

  if (enableExperimentalReact) {
    process.env.__NEXT_EXPERIMENTAL_REACT = 'true'
  }

  const {
    page,

    // Check if this is an `app/` page.
    _isAppDir: isAppDir = false,

    // TODO: use this when we've re-enabled app prefetching https://github.com/vercel/next.js/pull/58609
    // // Check if this is an `app/` prefix request.
    // _isAppPrefetch: isAppPrefetch = false,

    // Check if this should error when dynamic usage is detected.
    _isDynamicError: isDynamicError = false,

    // Pull the original query out.
    query: originalQuery = {},
  } = pathMap

  try {
    let query = { ...originalQuery }
    const pathname = normalizeAppPath(page)
    const isDynamic = isDynamicRoute(page)
    const outDir = isAppDir ? join(distDir, 'server/app') : input.outDir

    let params: { [key: string]: string | string[] } | undefined

    const filePath = normalizePagePath(path)
    const ampPath = `${filePath}.amp`
    let renderAmpPath = ampPath

    let updatedPath = query.__nextSsgPath || path
    delete query.__nextSsgPath

    let locale = query.__nextLocale || input.renderOpts.locale
    delete query.__nextLocale

    if (input.renderOpts.locale) {
      const localePathResult = normalizeLocalePath(
        path,
        input.renderOpts.locales
      )

      if (localePathResult.detectedLocale) {
        updatedPath = localePathResult.pathname
        locale = localePathResult.detectedLocale

        if (locale === input.renderOpts.defaultLocale) {
          renderAmpPath = `${normalizePagePath(updatedPath)}.amp`
        }
      }
    }

    // We need to show a warning if they try to provide query values
    // for an auto-exported page since they won't be available
    const hasOrigQueryValues = Object.keys(originalQuery).length > 0

    // Check if the page is a specified dynamic route
    const { pathname: nonLocalizedPath } = normalizeLocalePath(
      path,
      input.renderOpts.locales
    )

    if (isDynamic && page !== nonLocalizedPath) {
      const normalizedPage = isAppDir ? normalizeAppPath(page) : page

      params = getParams(normalizedPage, updatedPath)
      if (params) {
        query = {
          ...query,
          ...params,
        }
      }
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
      input.renderOpts.domainLocales &&
      input.renderOpts.domainLocales.some(
        (dl) =>
          dl.defaultLocale === locale || dl.locales?.includes(locale || '')
      )
    ) {
      addRequestMeta(req, 'isLocaleDomain', true)
    }

    envConfig.setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig: input.renderOpts.runtimeConfig,
    })

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

    // If the fetch cache was enabled, we need to create an incremental
    // cache instance for this page.
    const incrementalCache =
      isAppDir && fetchCache
        ? await createIncrementalCache({
            cacheHandler,
            cacheMaxMemorySize,
            fetchCacheKeyPrefix,
            distDir,
            dir,
            enabledDirectories,
            // PPR is not available for Pages.
            experimental: { ppr: false },
            // skip writing to disk in minimal mode for now, pending some
            // changes to better support it
            flushToDisk: !hasNextSupport,
          })
        : undefined

    // Handle App Routes.
    if (isAppDir && isAppRouteRoute(page)) {
      return await exportAppRoute(
        req,
        res,
        params,
        page,
        incrementalCache,
        distDir,
        htmlFilepath,
        fileWriter
      )
    }

    const components = await loadComponents({
      distDir,
      page,
      isAppPath: isAppDir,
    })

    const renderOpts: WorkerRenderOpts = {
      ...components,
      ...input.renderOpts,
      ampPath: renderAmpPath,
      params,
      optimizeFonts,
      optimizeCss,
      disableOptimizedLoading,
      fontManifest: optimizeFonts ? requireFontManifest(distDir) : undefined,
      locale,
      supportsDynamicHTML: false,
      originalPathname: page,
    }

    if (hasNextSupport) {
      renderOpts.isRevalidate = true
    }

    // Handle App Pages
    if (isAppDir) {
      // Set the incremental cache on the renderOpts, that's how app page's
      // consume it.
      renderOpts.incrementalCache = incrementalCache

      return await exportAppPage(
        req,
        res,
        page,
        path,
        pathname,
        query,
        renderOpts,
        htmlFilepath,
        debugOutput,
        isDynamicError,
        fileWriter
      )
    }

    return await exportPages(
      req,
      res,
      path,
      page,
      query,
      htmlFilepath,
      htmlFilename,
      ampPath,
      subFolders,
      outDir,
      ampValidatorPath,
      pagesDataDir,
      buildExport,
      isDynamic,
      hasOrigQueryValues,
      renderOpts,
      components,
      fileWriter
    )
  } catch (err) {
    console.error(
      `\nError occurred prerendering page "${path}". Read more: https://nextjs.org/docs/messages/prerender-error\n`
    )
    if (!isBailoutToCSRError(err)) {
      console.error(isError(err) && err.stack ? err.stack : err)
    }

    return { error: true }
  }
}

export default async function exportPage(
  input: ExportPageInput
): Promise<ExportPageResult | undefined> {
  // Configure the http agent.
  setHttpClientAndAgentOptions({
    httpAgentOptions: input.httpAgentOptions,
  })

  const files: ExportedPageFile[] = []
  const baseFileWriter: FileWriter = async (
    type,
    path,
    content,
    encodingOptions = 'utf-8'
  ) => {
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, content, encodingOptions)
    files.push({ type, path })
  }

  const exportPageSpan = trace('export-page-worker', input.parentSpanId)

  const start = Date.now()

  const turborepoAccessTraceResult = new TurborepoAccessTraceResult()
  // Export the page.
  const result = await exportPageSpan.traceAsyncFn(() =>
    turborepoTraceAccess(
      () => exportPageImpl(input, baseFileWriter),
      turborepoAccessTraceResult
    )
  )

  // If there was no result, then we can exit early.
  if (!result) return

  // If there was an error, then we can exit early.
  if ('error' in result) {
    return { error: result.error, duration: Date.now() - start, files: [] }
  }

  // Otherwise we can return the result.
  return {
    duration: Date.now() - start,
    files,
    ampValidations: result.ampValidations,
    revalidate: result.revalidate,
    metadata: result.metadata,
    ssgNotFound: result.ssgNotFound,
    hasEmptyPrelude: result.hasEmptyPrelude,
    hasPostponed: result.hasPostponed,
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
