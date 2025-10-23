import type { RenderOptsPartial as AppRenderOptsPartial } from '../server/app-render/types'
import type { RenderOptsPartial as PagesRenderOptsPartial } from '../server/render'
import type { LoadComponentsReturnType } from '../server/load-components'
import type { OutgoingHttpHeaders } from 'http'
import type { ExportPathMap, NextConfigComplete } from '../server/config-shared'
import type { CacheControl } from '../server/lib/cache-control'
import type { NextEnabledDirectories } from '../server/base-server'
import type {
  SerializableTurborepoAccessTraceResult,
  TurborepoAccessTraceResult,
} from '../build/turborepo-access-trace'
import type { FetchMetrics } from '../server/base-http'
import type { RouteMetadata } from './routes/types'
import type { RenderResumeDataCache } from '../server/resume-data-cache/resume-data-cache'

export type ExportPathEntry = ExportPathMap[keyof ExportPathMap] & {
  path: string
}

export interface ExportPagesInput {
  buildId: string
  exportPaths: ExportPathEntry[]
  parentSpanId: number
  dir: string
  distDir: string
  outDir: string
  pagesDataDir: string
  renderOpts: WorkerRenderOptsPartial
  nextConfig: NextConfigComplete
  cacheMaxMemorySize: NextConfigComplete['cacheMaxMemorySize']
  fetchCache: boolean | undefined
  cacheHandler: string | undefined
  fetchCacheKeyPrefix: string | undefined
  options: ExportAppOptions
  renderResumeDataCachesByPage: Record<string, string> | undefined
}

export interface ExportPageInput {
  buildId: string
  exportPath: ExportPathEntry
  distDir: string
  outDir: string
  pagesDataDir: string
  renderOpts: WorkerRenderOptsPartial
  trailingSlash?: boolean
  buildExport?: boolean
  subFolders?: boolean
  optimizeCss: any
  disableOptimizedLoading: any
  parentSpanId: number
  httpAgentOptions: NextConfigComplete['httpAgentOptions']
  debugOutput?: boolean
  nextConfigOutput?: NextConfigComplete['output']
  enableExperimentalReact?: boolean
  sriEnabled: boolean
  renderResumeDataCache: RenderResumeDataCache | undefined
}

export type ExportRouteResult =
  | {
      cacheControl: CacheControl
      metadata?: Partial<RouteMetadata>
      ssgNotFound?: boolean
      hasEmptyStaticShell?: boolean
      hasPostponed?: boolean
      fetchMetrics?: FetchMetrics
      renderResumeDataCache?: string
    }
  | {
      error: boolean
    }

export type ExportPageResult = ExportRouteResult & {
  duration: number
  turborepoAccessTraceResult?: SerializableTurborepoAccessTraceResult
}

export type ExportPagesResult = {
  result: ExportPageResult | undefined
  path: string
  page: string
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
  debugPrerender?: boolean
  pages?: string[]
  buildExport: boolean
  statusMessage?: string
  nextConfig?: NextConfigComplete
  hasOutdirFromCli?: boolean
  numWorkers: number
  appDirOnly: boolean
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
       * The cache control for the page.
       */
      cacheControl?: CacheControl
      /**
       * The metadata for the page.
       */
      metadata?: Partial<RouteMetadata>
      /**
       * If the page has an empty static shell when using PPR.
       */
      hasEmptyStaticShell?: boolean
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
