import type { WriteFileOptions } from 'fs'
import type { RenderOptsPartial as AppRenderOptsPartial } from '../server/app-render/types'
import type { RenderOptsPartial as PagesRenderOptsPartial } from '../server/render'
import type { LoadComponentsReturnType } from '../server/load-components'
import type { OutgoingHttpHeaders } from 'http'
import type AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import type { ExportPathMap, NextConfigComplete } from '../server/config-shared'
import type { Revalidate } from '../server/lib/revalidate'
import type { NextEnabledDirectories } from '../server/base-server'
import type {
  SerializableTurborepoAccessTraceResult,
  TurborepoAccessTraceResult,
} from '../build/turborepo-access-trace'
import type { FetchMetrics } from '../server/base-http'

export interface AmpValidation {
  page: string
  result: {
    errors: AmpHtmlValidator.ValidationError[]
    warnings: AmpHtmlValidator.ValidationError[]
  }
}

/**
 * Writes a file to the filesystem (and also records the file that was written).
 */
export type FileWriter = (
  type: string,
  path: string,
  content:
    | string
    | NodeJS.ArrayBufferView
    | Iterable<string | NodeJS.ArrayBufferView>
    | AsyncIterable<string | NodeJS.ArrayBufferView>,
  encodingOptions?: WriteFileOptions
) => Promise<void>

type PathMap = ExportPathMap[keyof ExportPathMap]

export interface ExportPagesInput {
  paths: string[]
  exportPathMap: ExportPathMap
  parentSpanId: number
  dir: string
  distDir: string
  outDir: string
  pagesDataDir: string
  renderOpts: WorkerRenderOptsPartial
  nextConfig: NextConfigComplete
  cacheMaxMemorySize: NextConfigComplete['cacheMaxMemorySize'] | undefined
  fetchCache: boolean | undefined
  cacheHandler: string | undefined
  fetchCacheKeyPrefix: string | undefined
  options: ExportAppOptions
}

export interface ExportPageInput {
  path: string
  pathMap: PathMap
  distDir: string
  outDir: string
  pagesDataDir: string
  renderOpts: WorkerRenderOptsPartial
  ampValidatorPath?: string
  trailingSlash?: boolean
  buildExport?: boolean
  serverRuntimeConfig: { [key: string]: any }
  subFolders?: boolean
  optimizeCss: any
  disableOptimizedLoading: any
  parentSpanId: number
  httpAgentOptions: NextConfigComplete['httpAgentOptions']
  debugOutput?: boolean
  nextConfigOutput?: NextConfigComplete['output']
  enableExperimentalReact?: boolean
}

export type ExportedPageFile = {
  type: string
  path: string
}

export type ExportRouteResult =
  | {
      ampValidations?: AmpValidation[]
      revalidate: Revalidate
      metadata?: {
        status?: number
        headers?: OutgoingHttpHeaders
      }
      ssgNotFound?: boolean
      hasEmptyPrelude?: boolean
      hasPostponed?: boolean
      fetchMetrics?: FetchMetrics
    }
  | {
      error: boolean
    }

export type ExportPageResult = ExportRouteResult & {
  files: ExportedPageFile[]
  duration: number
  turborepoAccessTraceResult?: SerializableTurborepoAccessTraceResult
}

export type ExportPagesResult = {
  result: ExportPageResult | undefined
  path: string
  pageKey: string
}[]

export type WorkerRenderOptsPartial = PagesRenderOptsPartial &
  AppRenderOptsPartial

export type WorkerRenderOpts = WorkerRenderOptsPartial &
  LoadComponentsReturnType

export interface ExportAppOptions {
  outdir: string
  enabledDirectories: NextEnabledDirectories
  silent?: boolean
  debugOutput?: boolean
  pages?: string[]
  buildExport: boolean
  statusMessage?: string
  nextConfig?: NextConfigComplete
  hasOutdirFromCli?: boolean
  numWorkers: number
}

export type ExportPageMetadata = {
  revalidate: number | false
  metadata:
    | {
        status?: number | undefined
        headers?: OutgoingHttpHeaders | undefined
      }
    | undefined
  duration: number
}

export type ExportAppResult = {
  /**
   * Page information keyed by path.
   */
  byPath: Map<
    string,
    {
      /**
       * The revalidation time for the page in seconds.
       */
      revalidate?: Revalidate
      /**
       * The metadata for the page.
       */
      metadata?: { status?: number; headers?: OutgoingHttpHeaders }
      /**
       * If the page has an empty prelude when using PPR.
       */
      hasEmptyPrelude?: boolean
      /**
       * If the page has postponed when using PPR.
       */
      hasPostponed?: boolean

      fetchMetrics?: FetchMetrics
    }
  >

  /**
   * Durations for each page in milliseconds.
   */
  byPage: Map<string, { durationsByPath: Map<string, number> }>

  /**
   * The paths that were not found during SSG.
   */
  ssgNotFoundPaths: Set<string>

  /**
   * Traced dependencies for each page.
   */
  turborepoAccessTraceResults: Map<string, TurborepoAccessTraceResult>
}
