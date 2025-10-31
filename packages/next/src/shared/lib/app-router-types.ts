/**
 * App Router types - Client-safe types for the Next.js App Router
 *
 * This file contains type definitions that can be safely imported
 * by both client-side and server-side code without circular dependencies.
 */
import type { FetchServerResponseResult } from '../../client/components/router-reducer/fetch-server-response'
import type React from 'react'

export type LoadingModuleData =
  | [React.JSX.Element, React.ReactNode, React.ReactNode]
  | null

/** viewport metadata node */
export type HeadData = React.ReactNode

export type ChildSegmentMap = Map<string, CacheNode>

/**
 * Cache node used in app-router / layout-router.
 */
export type CacheNode = ReadyCacheNode | LazyCacheNode

export type LazyCacheNode = {
  /**
   * When rsc is null, this is a lazily-initialized cache node.
   *
   * If the app attempts to render it, it triggers a lazy data fetch,
   * postpones the render, and schedules an update to a new tree.
   *
   * TODO: This mechanism should not be used when PPR is enabled, though it
   * currently is in some cases until we've implemented partial
   * segment fetching.
   */
  rsc: null

  /**
   * A prefetched version of the segment data. See explanation in corresponding
   * field of ReadyCacheNode (below).
   *
   * Since LazyCacheNode mostly only exists in the non-PPR implementation, this
   * will usually be null, but it could have been cloned from a previous
   * CacheNode that was created by the PPR implementation. Eventually we want
   * to migrate everything away from LazyCacheNode entirely.
   */
  prefetchRsc: React.ReactNode

  /**
   * A pending response for the lazy data fetch. If this is not present
   * during render, it is lazily created.
   */
  lazyData: Promise<FetchServerResponseResult> | null

  prefetchHead: HeadData | null

  head: HeadData

  loading: LoadingModuleData | Promise<LoadingModuleData>

  /**
   * Child parallel routes.
   */
  parallelRoutes: Map<string, ChildSegmentMap>

  /**
   * The timestamp of the navigation that last updated the CacheNode's data. If
   * a CacheNode is reused from a previous navigation, this value is not
   * updated. Used to track the staleness of the data.
   */
  navigatedAt: number
}

export type ReadyCacheNode = {
  /**
   * When rsc is not null, it represents the RSC data for the
   * corresponding segment.
   *
   * `null` is a valid React Node but because segment data is always a
   * <LayoutRouter> component, we can use `null` to represent empty.
   *
   * TODO: For additional type safety, update this type to
   * Exclude<React.ReactNode, null>. Need to update createEmptyCacheNode to
   * accept rsc as an argument, or just inline the callers.
   */
  rsc: React.ReactNode

  /**
   * Represents a static version of the segment that can be shown immediately,
   * and may or may not contain dynamic holes. It's prefetched before a
   * navigation occurs.
   *
   * During rendering, we will choose whether to render `rsc` or `prefetchRsc`
   * with `useDeferredValue`. As with the `rsc` field, a value of `null` means
   * no value was provided. In this case, the LayoutRouter will go straight to
   * rendering the `rsc` value; if that one is also missing, it will suspend and
   * trigger a lazy fetch.
   */
  prefetchRsc: React.ReactNode

  /**
   * There should never be a lazy data request in this case.
   */
  lazyData: null
  prefetchHead: HeadData | null

  head: HeadData

  loading: LoadingModuleData | Promise<LoadingModuleData>

  parallelRoutes: Map<string, ChildSegmentMap>

  navigatedAt: number
}

export type DynamicParamTypes =
  | 'catchall'
  | 'catchall-intercepted'
  | 'optional-catchall'
  | 'dynamic'
  | 'dynamic-intercepted'

export type DynamicParamTypesShort = 'c' | 'ci' | 'oc' | 'd' | 'di'

export type Segment =
  | string
  | [
      // Param name
      paramName: string,
      // Param cache key (almost the same as the value, but arrays are
      // concatenated into strings)
      // TODO: We should change this to just be the value. Currently we convert
      // it back to a value when passing to useParams. It only needs to be
      // a string when converted to a a cache key, but that doesn't mean we
      // need to store it as that representation.
      paramCacheKey: string,
      // Dynamic param type
      dynamicParamType: DynamicParamTypesShort,
    ]

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
   * - "metadata-only" instructs the server to skip rendering the segments and
   *   only send the head data.
   *
   *   A bit confusing, but that's because it has only one extremely narrow use
   *   case — during a non-PPR prefetch, the server uses it to find the first
   *   loading boundary beneath a shared layout.
   *
   *   TODO: We should rethink the protocol for dynamic requests. It might not
   *   make sense for the client to send a FlightRouterState, since this type is
   *   overloaded with concerns.
   */
  refresh?:
    | 'refetch'
    | 'refresh'
    | 'inside-shared-layout'
    | 'metadata-only'
    | null,
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
  node: React.ReactNode | null,
  parallelRoutes: {
    [parallelRouterKey: string]: CacheNodeSeedData | null
  },
  loading: LoadingModuleData | Promise<LoadingModuleData>,
  isPartial: boolean,
  /** TODO: this doesn't feel like it belongs here, because it's only used during build, in `collectSegmentData` */
  hasRuntimePrefetch: boolean,
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

export type InitialRSCPayload = {
  /** buildId */
  b: string
  /** initialCanonicalUrlParts */
  c: string[]
  /** initialRenderedSearch */
  q: string
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
