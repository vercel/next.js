import type { LoadComponentsReturnType } from '../load-components'
import type { ServerRuntime, SizeLimit } from '../../types'
import type { NextConfigComplete } from '../../server/config-shared'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import type { ParsedUrlQuery } from 'querystring'
import type { AppPageModule } from '../route-modules/app-page/module'
import type { SwrDelta } from '../lib/revalidate'
import type { LoadingModuleData } from '../../shared/lib/app-router-context.shared-runtime'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'

import s from 'next/dist/compiled/superstruct'
import type { RequestLifecycleOpts } from '../base-server'
import type { InstrumentationOnRequestError } from '../instrumentation/types'
import type { NextRequestHint } from '../web/adapter'
import type { BaseNextRequest } from '../base-http'
import type { IncomingMessage } from 'http'

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
  s.optional(s.nullable(s.union([s.literal('refetch'), s.literal('refresh')]))),
  s.optional(s.boolean()),
])

/**
 * Router state
 */
export type FlightRouterState = [
  segment: Segment,
  parallelRoutes: { [parallelRouterKey: string]: FlightRouterState },
  url?: string | null,
  /*
  /* "refresh" and "refetch", despite being similarly named, have different semantics.
   * - "refetch" is a server indicator which informs where rendering should start from.
   * - "refresh" is a client router indicator that it should re-fetch the data from the server for the current segment.
   *   It uses the "url" property above to determine where to fetch from.
   */
  refresh?: 'refetch' | 'refresh' | null,
  isRootLayout?: boolean,
]

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
  parallelRoutes: {
    [parallelRouterKey: string]: CacheNodeSeedData | null
  },
  node: React.ReactNode | null,
  loading: LoadingModuleData,
]

export type FlightDataPath =
  // Uses `any` as repeating pattern can't be typed.
  | any[]
  // Looks somewhat like this
  | [
      // Holds full path to the segment.
      ...FlightSegmentPath[],
      /* segment of the rendered slice: */ Segment,
      /* treePatch */ FlightRouterState,
      /* cacheNodeSeedData */ CacheNodeSeedData, // Can be null during prefetch if there's no loading component
      /* head */ React.ReactNode | null,
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
  err?: Error | null
  dev?: boolean
  buildId: string
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
  isBot?: boolean
  incrementalCache?: import('../lib/incremental-cache').IncrementalCache
  setAppIsrStatus?: (key: string, value: false | number | null) => void
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
  experimental: {
    /**
     * When true, it indicates that the current page supports partial
     * prerendering.
     */
    isRoutePPREnabled?: boolean
    swrDelta: SwrDelta | undefined
    clientTraceMetadata: string[] | undefined
    after: boolean
  }
  postponed?: string
  /**
   * When true, only the static shell of the page will be rendered. This will
   * also enable other debugging features such as logging in development.
   */
  isDebugStaticShell?: boolean

  /**
   * When true, the page will be rendered using the static rendering to detect
   * any dynamic API's that would have stopped the page from being fully
   * statically generated.
   */
  isDebugDynamicAccesses?: boolean
  isStaticGeneration?: boolean
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
  /** initialCanonicalUrl */
  c: string
  /** couldBeIntercepted */
  i: boolean
  /** initialFlightData */
  f: FlightDataPath[]
  /** missingSlots */
  m: Set<string> | undefined
  /** GlobalError */
  G: React.ComponentType<any>
}

// Response from `createFromFetch` for normal rendering
export type NavigationFlightResponse = {
  /** buildId */
  b: string
  /** flightData */
  f: FlightData
}

// Response from `createFromFetch` for server actions. Action's flight data can be null
export type ActionFlightResponse = {
  /** actionResult */
  a: ActionResult
  /** buildId */
  b: string
  /** flightData */
  f: FlightData | null
}

export type FetchServerResponseResult = {
  /** flightData */
  f: FlightData
  /** canonicalUrl */
  c: URL | undefined
  /** couldBeIntercepted */
  i: boolean
  /** isPrerender */
  p: boolean
}

export type RSCPayload =
  | InitialRSCPayload
  | NavigationFlightResponse
  | ActionFlightResponse
