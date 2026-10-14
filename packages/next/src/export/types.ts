import type { Page, Route } from '../shared/lib/route-types'
import type { RenderOptsPartial as AppRenderOptsPartial } from '../server/app-render/types'
import type { RenderOptsPartial as PagesRenderOptsPartial } from '../server/render'
import type {
  GenericComponentMod,
  LoadComponentsReturnType,
} from '../server/load-components'
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
import type { StaticWorker } from '../build'
import type { Bundler } from '../lib/bundler'

export type ExportPathEntry = ExportPathMap[keyof ExportPathMap] & {
  /** Internal side of the public exportPathMap boundary. */
  page: Page
  path: Route
  _ssgPath?: Route
}

export interface ExportPagesInput {
  buildId: string
  deploymentId: string
  clientAssetToken: string
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
  deploymentId: string
  clientAssetToken: string
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
  /** Write build-time response artifacts to their route-scoped cache keys. */
  useScopedBuildArtifacts: boolean
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
      hasPendingUi?: boolean
      htmlSize?: number
      hasStaticRsc?: boolean
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
  path: Route
  page: Page
  // A diagnostic identity can combine a module and URL ("page: path").
  pageKey: string
}[]

export type WorkerRenderOptsPartial = PagesRenderOptsPartial &
  AppRenderOptsPartial

export type WorkerRenderOpts<
  NextModule extends GenericComponentMod = GenericComponentMod,
> = WorkerRenderOptsPartial & LoadComponentsReturnType<NextModule>

export interface ExportAppOptions {
  staticWorker?: StaticWorker
  outdir: string
  enabledDirectories: NextEnabledDirectories
  silent?: boolean
  debugOutput?: boolean
  debugPrerender?: boolean
  pages?: Route[]
  buildExport: boolean
  statusMessage?: string
  nextConfig?: NextConfigComplete
  hasOutdirFromCli?: boolean
  numWorkers: number
  appDirOnly: boolean
  bundler: Bundler
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
   * Page information keyed by its prerender URL pathname.
   */
  byPath: Map<
    Route,
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
      /**
       * If the prerender has UI that will resolve after the initial HTML.
       */
      hasPendingUi?: boolean
      /**
       * The byte size of the HTML returned by the prerender.
       */
      htmlSize?: number
      /**
       * If the page emitted a static RSC payload.
       */
      hasStaticRsc?: boolean

      fetchMetrics?: FetchMetrics
    }
  >

  /**
   * Durations for each page in milliseconds.
   */
  byPage: Map<Page, { durationsByPath: Map<Route, number> }>

  /**
   * The paths that were not found during SSG.
   */
  ssgNotFoundPaths: Set<Route>

  /**
   * Traced dependencies for each page.
   */
  turborepoAccessTraceResults: Map<string, TurborepoAccessTraceResult>
}
