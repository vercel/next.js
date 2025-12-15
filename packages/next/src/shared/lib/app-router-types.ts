/**
 * App Router types - Client-safe types for the Next.js App Router
 *
 * This file contains type definitions that can be safely imported
 * by both client-side and server-side code without circular dependencies.
 */

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

export type CacheNode = {
  /**
   * When rsc is not null, it represents the RSC data for the
   * corresponding segment.
   *
   * `null` is a valid React Node but because segment data is always a
   * <LayoutRouter> component, we can use `null` to represent empty. When it is
   * null, it represents missing data, and rendering should suspend.
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

  prefetchHead: HeadData | null

  head: HeadData

  loading: LoadingModuleData | Promise<LoadingModuleData>

  parallelRoutes: Map<string, ChildSegmentMap>

  /**
   * The timestamp of the navigation that last updated the CacheNode's data. If
   * a CacheNode is reused from a previous navigation, this value is not
   * updated. Used to track the staleness of the data.
   */
  navigatedAt: number
}

export type DynamicParamTypes =
  | 'catchall'
  | 'catchall-intercepted-(..)(..)'
  | 'catchall-intercepted-(.)'
  | 'catchall-intercepted-(..)'
  | 'catchall-intercepted-(...)'
  | 'optional-catchall'
  | 'dynamic'
  | 'dynamic-intercepted-(..)(..)'
  | 'dynamic-intercepted-(.)'
  | 'dynamic-intercepted-(..)'
  | 'dynamic-intercepted-(...)'

export type DynamicParamTypesShort =
  | 'c'
  | 'ci(..)(..)'
  | 'ci(.)'
  | 'ci(..)'
  | 'ci(...)'
  | 'oc'
  | 'd'
  | 'di(..)(..)'
  | 'di(.)'
  | 'di(..)'
  | 'di(...)'

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
  refreshState?: RefreshState | null,
  /**
   * - "refetch" is used during a request to inform the server where rendering
   *   should start from.
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
  refresh?: 'refetch' | 'inside-shared-layout' | 'metadata-only' | null,
  isRootLayout?: boolean,
  /**
   * Only present when responding to a tree prefetch request. Indicates whether
   * there is a loading boundary somewhere in the tree. The client cache uses
   * this to determine if it can skip the data prefetch request.
   */
  hasLoadingBoundary?: HasLoadingBoundary,
]

/**
 * When rendering a parallel route, some of the parallel paths may not match
 * the current URL. In that case, the Next client has to render something,
 * so it will render whichever was the last route to match that slot. We use
 * this type to track when this has happened. It's a tuple of the original
 * URL that was used to fetch the segment, and the (possibly rewritten) search
 * query that was rendered by the server. The URL is needed when performing
 * a refresh of the segment, and the search query is needed for looking up
 * matching entries in the segment cache.
 */
export type RefreshState = [url: string, renderedSearch: string]

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
  /** renderedSearch */
  q: string
  /** couldBeIntercepted */
  i: boolean
  /** runtimePrefetch - [isPartial, staleTime]. Only present in runtime prefetch responses. */
  rp?: [boolean, number]
}

// Response from `createFromFetch` for server actions. Action's flight data can be null
export type ActionFlightResponse = {
  /** actionResult */
  a: ActionResult
  /** buildId */
  b: string
  /** flightData */
  f: FlightData
  /** renderedSearch */
  q: string
  /** couldBeIntercepted */
  i: boolean
}

export type RSCPayload =
  | InitialRSCPayload
  | NavigationFlightResponse
  | ActionFlightResponse
