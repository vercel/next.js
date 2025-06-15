import type { LoadComponentsReturnType } from '../load-components'
import type { ServerRuntime, SizeLimit } from '../../types'
import type {
  ExperimentalConfig,
  NextConfigComplete,
} from '../../server/config-shared'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import type { ParsedUrlQuery } from 'querystring'
import type { AppPageModule } from '../route-modules/app-page/module'
import type {
  HeadData,
  LoadingModuleData,
} from '../../shared/lib/app-router-context.shared-runtime'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import type { __ApiPreviewProps } from '../api-utils'

import s from 'next/dist/compiled/superstruct'
import type { RequestLifecycleOpts } from '../base-server'
import type { InstrumentationOnRequestError } from '../instrumentation/types'
import type { NextRequestHint } from '../web/adapter'
import type { BaseNextRequest } from '../base-http'
import type { IncomingMessage } from 'http'
import type { RenderResumeDataCache } from '../resume-data-cache/resume-data-cache'

export type DynamicParamTypes =
  | 'catchall'
  | 'catchall-intercepted'
  | 'optional-catchall'
  | 'dynamic'
  | 'dynamic-intercepted'

const dynamicParamTypesSchema = s.enums(['c', 'ci', 'oc', 'd', 'di'])

export type DynamicParamTypesShort = s.Infer<typeof dynamicParamTypesSchema>

const segmentSchema = s.union([
  s.string(),
  s.tuple([s.string(), s.string(), dynamicParamTypesSchema]),
])

export type Segment = s.Infer<typeof segmentSchema>

// unfortunately the tuple is not understood well by Describe so we have to
// use any here. This does not have any impact on the runtime type since the validation
// does work correctly.
export const flightRouterStateSchema: s.Describe<any> = s.tuple([
  segmentSchema,
  s.record(
    s.string(),
    s.lazy(() => flightRouterStateSchema)
  ),
  s.optional(s.nullable(s.string())),
  s.optional(
    s.nullable(
      s.union([
        s.literal('refetch'),
        s.literal('refresh'),
        s.literal('inside-shared-layout'),
      ])
    )
  ),
  s.optional(s.boolean()),
])

/**
 * Router state
 */
export type FlightRouterState = [
  segment: Segment,
  parallelRoutes: { [parallelRouterKey: string]: FlightRouterState },
  url?: string | null,
  /**
   * "refresh" and "refetch", despite being similarly named, have different
   * semantics:
   * - "refetch" is used during a request to inform the server where rendering
   *   should start from.
   *
   * - "refresh" is used by the client to mark that a segment should re-fetch the
   *   data from the server for the current segment. It uses the "url" property
   *   above to determine where to fetch from.
   *
   * - "inside-shared-layout" is used during a prefetch request to inform the
   *   server that even if the segment matches, it should be treated as if it's
   *   within the "new" part of a navigation — inside the shared layout. If
   *   the segment doesn't match, then it has no effect, since it would be
   *   treated as new regardless. If it does match, though, the server does not
   *   need to render it, because the client already has it.
   *
   *   A bit confusing, but that's because it has only one extremely narrow use
   *   case — during a non-PPR prefetch, the server uses it to find the first
   *   loading boundary beneath a shared layout.
   *
   *   TODO: We should rethink the protocol for dynamic requests. It might not
   *   make sense for the client to send a FlightRouterState, since this type is
   *   overloaded with concerns.
   */
  refresh?: 'refetch' | 'refresh' | 'inside-shared-layout' | null,
  isRootLayout?: boolean,
  /**
   * Only present when responding to a tree prefetch request. Indicates whether
   * there is a loading boundary somewhere in the tree. The client cache uses
   * this to determine if it can skip the data prefetch request.
   */
  hasLoadingBoundary?: HasLoadingBoundary,
]

export const enum HasLoadingBoundary {
  // There is a loading boundary in this particular segment
  SegmentHasLoadingBoundary = 1,
  // There is a loading boundary somewhere in the subtree (but not in
  // this segment)
  SubtreeHasLoadingBoundary = 2,
  // There is no loading boundary in this segment or any of its descendants
  SubtreeHasNoLoadingBoundary = 3,
}

/**
 * Individual Flight response path
 */
export type FlightSegmentPath =
  // Uses `any` as repeating pattern can't be typed.
  | any[]
  // Looks somewhat like this
  | [
      segment: Segment,
      parallelRouterKey: string,
      segment: Segment,
      parallelRouterKey: string,
      segment: Segment,
      parallelRouterKey: string,
    ]

/**
 * Represents a tree of segments and the Flight data (i.e. React nodes) that
 * correspond to each one. The tree is isomorphic to the FlightRouterState;
 * however in the future we want to be able to fetch arbitrary partial segments
 * without having to fetch all its children. So this response format will
 * likely change.
 */
export type CacheNodeSeedData = [
  segment: Segment,
  node: React.ReactNode | null,
  parallelRoutes: {
    [parallelRouterKey: string]: CacheNodeSeedData | null
  },
  loading: LoadingModuleData | Promise<LoadingModuleData>,
  isPartial: boolean,
]

export type FlightDataSegment = [
  /* segment of the rendered slice: */ Segment,
  /* treePatch */ FlightRouterState,
  /* cacheNodeSeedData */ CacheNodeSeedData | null, // Can be null during prefetch if there's no loading component
  /* head: viewport */ HeadData,
  /* isHeadPartial */ boolean,
]

export type FlightDataPath =
  // Uses `any` as repeating pattern can't be typed.
  | any[]
  // Looks somewhat like this
  | [
      // Holds full path to the segment.
      ...FlightSegmentPath[],
      ...FlightDataSegment,
    ]

/**
 * The Flight response data
 */
export type FlightData = Array<FlightDataPath> | string

export type ActionResult = Promise<any>

export type ServerOnInstrumentationRequestError = (
  error: unknown,
  // The request could be middleware, node server or web server request,
  // we normalized them into an aligned format to `onRequestError` API later.
  request: NextRequestHint | BaseNextRequest | IncomingMessage,
  errorContext: Parameters<InstrumentationOnRequestError>[2]
) => void | Promise<void>

export interface RenderOptsPartial {
  dir?: string
  previewProps: __ApiPreviewProps | undefined
  err?: Error | null
  dev?: boolean
  basePath: string
  trailingSlash: boolean
  clientReferenceManifest?: DeepReadonly<ClientReferenceManifest>
  supportsDynamicResponse: boolean
  runtime?: ServerRuntime
  serverComponents?: boolean
  enableTainting?: boolean
  assetPrefix?: string
  crossOrigin?: '' | 'anonymous' | 'use-credentials' | undefined
  nextFontManifest?: DeepReadonly<NextFontManifest>
  botType?: 'dom' | 'html' | undefined
  serveStreamingMetadata?: boolean
  incrementalCache?: import('../lib/incremental-cache').IncrementalCache
  cacheLifeProfiles?: {
    [profile: string]: import('../use-cache/cache-life').CacheLife
  }
  isOnDemandRevalidate?: boolean
  isPossibleServerAction?: boolean
  setIsrStatus?: (key: string, value: boolean | null) => void
  isRevalidate?: boolean
  nextExport?: boolean
  nextConfigOutput?: 'standalone' | 'export'
  onInstrumentationRequestError?: ServerOnInstrumentationRequestError
  isDraftMode?: boolean
  deploymentId?: string
  onUpdateCookies?: (cookies: string[]) => void
  loadConfig?: (
    phase: string,
    dir: string,
    customConfig?: object | null,
    rawConfig?: boolean,
    silent?: boolean
  ) => Promise<NextConfigComplete>
  serverActions?: {
    bodySizeLimit?: SizeLimit
    allowedOrigins?: string[]
  }
  params?: ParsedUrlQuery
  isPrefetch?: boolean
  htmlLimitedBots: string | undefined
  experimental: {
    /**
     * When true, it indicates that the current page supports partial
     * prerendering.
     */
    isRoutePPREnabled?: boolean
    expireTime: number | undefined
    staleTimes: ExperimentalConfig['staleTimes'] | undefined
    clientTraceMetadata: string[] | undefined
    dynamicIO: boolean
    clientSegmentCache: boolean | 'client-only'
    dynamicOnHover: boolean
    inlineCss: boolean
    authInterrupts: boolean
  }
  postponed?: string

  /**
   * Should wait for react stream allReady to resolve all suspense boundaries,
   * in order to perform a full page render.
   */
  shouldWaitOnAllReady?: boolean

  /**
   * A prefilled resume data cache. This was either generated for this page
   * during dev warmup, or when a page with defined params was previously
   * prerendered, and now its matching optional fallback shell is prerendered.
   */
  renderResumeDataCache?: RenderResumeDataCache

  /**
   * When true, the page will be rendered using the static rendering to detect
   * any dynamic API's that would have stopped the page from being fully
   * statically generated.
   */
  isDebugDynamicAccesses?: boolean

  /**
   * The maximum length of the headers that are emitted by React and added to
   * the response.
   */
  reactMaxHeadersLength: number | undefined

  isStaticGeneration?: boolean

  /**
   * When true, the page is prerendered as a fallback shell, while allowing any
   * dynamic accesses to result in an empty shell. This is the case when there
   * are also routes prerendered with a more complete set of params.
   * Prerendering those routes would catch any invalid dynamic accesses.
   */
  allowEmptyStaticShell?: boolean

  /**
   * next config experimental.devtoolSegmentExplorer
   */
  devtoolSegmentExplorer?: boolean
}

export type RenderOpts = LoadComponentsReturnType<AppPageModule> &
  RenderOptsPartial &
  RequestLifecycleOpts

export type PreloadCallbacks = (() => void)[]

export type InitialRSCPayload = {
  /** buildId */
  b: string
  /** assetPrefix */
  p: string
  /** initialCanonicalUrlParts */
  c: string[]
  /** couldBeIntercepted */
  i: boolean
  /** initialFlightData */
  f: FlightDataPath[]
  /** missingSlots */
  m: Set<string> | undefined
  /** GlobalError */
  G: [React.ComponentType<any>, React.ReactNode | undefined]
  /** postponed */
  s: boolean
  /** prerendered */
  S: boolean
}

// Response from `createFromFetch` for normal rendering
export type NavigationFlightResponse = {
  /** buildId */
  b: string
  /** flightData */
  f: FlightData
  /** prerendered */
  S: boolean
}

// Response from `createFromFetch` for server actions. Action's flight data can be null
export type ActionFlightResponse = {
  /** actionResult */
  a: ActionResult
  /** buildId */
  b: string
  /** flightData */
  f: FlightData
}

export type RSCPayload =
  | InitialRSCPayload
  | NavigationFlightResponse
  | ActionFlightResponse
