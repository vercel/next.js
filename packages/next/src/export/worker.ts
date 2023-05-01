import type { FontManifest } from '../server/font-utils'
import type {
  DomainLocale,
  ExportPathMap,
  NextConfigComplete,
} from '../server/config-shared'
import type { OutgoingHttpHeaders } from 'http'

// Polyfill fetch for the export worker.
import '../server/node-polyfill-fetch'
import '../server/node-environment'

import { join } from 'path'
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import { trace } from '../trace'
import isError from '../lib/is-error'
import { IncrementalCache } from '../server/lib/incremental-cache'
import { isAppRouteRoute } from '../lib/is-app-route-route'
import { exportAppRouteRoute } from './future/exporters/export-app-route-route'
import { BatchedFileWriter } from './helpers/batched-file-writer'
import { exportAppPageRoute } from './future/exporters/export-app-page-route'
import { exportPagesRoute } from './future/exporters/export-pages-route'
import { ExportersResult } from './future/exporters/exporters'
import { getIncrementalCache } from './helpers/get-incremental-cache'

const envConfig = require('../shared/lib/runtime-config')

;(globalThis as any).__NEXT_DATA__ = {
  nextExport: true,
}

interface AmpValidation {
  page: string
  result: {
    errors: AmpHtmlValidator.ValidationError[]
    warnings: AmpHtmlValidator.ValidationError[]
  }
}

type PathMap = ExportPathMap[keyof ExportPathMap]

interface ExportPageInput {
  path: string
  pathMap: PathMap
  distDir: string
  outDir: string
  pagesDataDir: string
  renderOpts: RenderOpts
  buildExport?: boolean
  serverRuntimeConfig: { [key: string]: any }
  subFolders?: boolean
  parentSpanId: any
  serverComponents?: boolean
  debugOutput?: boolean
  isrMemoryCacheSize?: NextConfigComplete['experimental']['isrMemoryCacheSize']
  fetchCache?: boolean
  incrementalCacheHandlerPath?: string
  fetchCacheKeyPrefix?: string
  nextConfigOutput?: NextConfigComplete['output']
}

export interface ExportPageResults {
  ampValidations?: AmpValidation[]
  fromBuildExportRevalidate?: number | false
  fromBuildExportMeta?: {
    status?: number
    headers?: OutgoingHttpHeaders
  }
  error?: boolean
  ssgNotFound?: boolean
  duration: number
}

export interface RenderOpts {
  runtimeConfig?: { [key: string]: any }
  params?: { [key: string]: string | string[] }
  ampPath?: string
  ampValidatorPath?: string
  ampSkipValidation?: boolean
  fontManifest?: FontManifest
  locales?: string[]
  locale?: string
  defaultLocale?: string
  domainLocales?: DomainLocale[]
  trailingSlash?: boolean
  supportsDynamicHTML?: boolean
  strictNextHead?: boolean
}

export default async function exportPage({
  parentSpanId,
  path,
  pathMap,
  distDir,
  outDir,
  pagesDataDir,
  renderOpts,
  buildExport = false,
  serverRuntimeConfig,
  subFolders = false,
  serverComponents = false,
  debugOutput,
  isrMemoryCacheSize,
  fetchCache,
  fetchCacheKeyPrefix,
  incrementalCacheHandlerPath,
}: ExportPageInput): Promise<ExportPageResults> {
  const exportPageSpan = trace('export-page-worker', parentSpanId)

  // Create the batched writer that can be used to write all the files to disk
  // that were generated during the export of this page.
  const writer = new BatchedFileWriter()
  const start = Date.now()

  const results = await exportPageSpan.traceAsyncFn(
    async (): Promise<ExportersResult | null> => {
      try {
        const { query: originalQuery = {} } = pathMap
        const { page } = pathMap
        const isAppDir = pathMap._isAppDir === true
        const isDynamicError = pathMap._isDynamicError === true
        const query = { ...originalQuery }
        const isRouteHandler = isAppDir && isAppRouteRoute(page)
        if (isAppDir) {
          outDir = join(distDir, 'server/app')
        }

        envConfig.setConfig({
          serverRuntimeConfig,
          publicRuntimeConfig: renderOpts.runtimeConfig,
        })

        // during build we attempt rendering app dir paths
        // and bail when dynamic dependencies are detected
        // only fully static paths are fully generated here
        if (isAppDir) {
          let incrementalCache: IncrementalCache | undefined

          if (fetchCache) {
            // Bind the cache to the globalThis so it can be accessed by the
            // static generation storage handler.
            incrementalCache = getIncrementalCache({
              distDir,
              fetchCacheKeyPrefix,
              isrMemoryCacheSize,
              incrementalCacheHandlerPath,
            })
            ;(globalThis as any).__incrementalCache = incrementalCache
          }

          if (isRouteHandler) {
            return await exportAppRouteRoute({
              page,
              pathname: path,
              distDir,
              outDir,
              incrementalCache,
              subFolders,
              writer,
            })
          }

          return await exportAppPageRoute({
            page,
            pathname: path,
            query,
            distDir,
            writer,
            serverComponents,
            isDynamicError,
            debugOutput,
            subFolders,
            outDir,
            incrementalCache,
            renderOpts: {
              // TODO: (wyattjoh) the type for RenderOpts here is wrong, lots of `as any` used above
              ...renderOpts,
              supportsDynamicHTML: false,
            },
          })
        }

        return await exportPagesRoute({
          page,
          pathname: path,
          query,
          distDir,
          subFolders,
          outDir,
          pagesDataDir,
          buildExport,
          renderOpts: {
            defaultLocale: renderOpts.defaultLocale,
            locale: renderOpts.locale,
            domainLocales: renderOpts.domainLocales,
            trailingSlash: renderOpts.trailingSlash,
          },
          writer,
        })
      } catch (error) {
        return { type: 'error', error }
      }
    }
  )

  // Flush the file writes to disk.
  await writer.flush()

  const duration = Date.now() - start

  // Transform the results into the expected format.
  switch (results?.type) {
    case 'error':
      // Log the error if this export failed due to an error.
      const { error } = results
      console.error(
        `\nError occurred prerendering page "${path}". Read more: https://nextjs.org/docs/messages/prerender-error\n` +
          (isError(error) && error.stack ? error.stack : error)
      )

      return {
        fromBuildExportRevalidate: 0,
        error: true,
        duration,
      }
    case 'built':
      return {
        // TODO: (wyattjoh) add amp validation results
        ampValidations: [],
        fromBuildExportRevalidate: results.revalidate,
        fromBuildExportMeta: results.metadata,
        duration,
      }
    case 'not-found':
      return {
        ssgNotFound: true,
        fromBuildExportRevalidate: 0,
        duration,
      }
    default:
      // TODO: (wyattjoh) maybe we don't need this?
      return {
        duration,
      }
  }
}
