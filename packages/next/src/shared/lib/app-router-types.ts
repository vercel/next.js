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

import type { VaryParamsThenable } from './segment-cache/vary-params-decoding'

/** viewport metadata node */
export type HeadData = React.ReactNode

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

  slots: Record<string, CacheNode> | null
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

// The tuple form of a segment, used for dynamic route params
export type DynamicSegmentTuple = [
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
  // Static sibling segments at the same URL level. Used by the client
  // router to determine if a prefetch can be reused when navigating to
  // a static sibling of a dynamic route. For example, if the route is
  // /products/[id] and there's also /products/sale, then staticSiblings
  // would be ['sale']. null means the siblings are unknown (e.g. in
  // webpack dev mode).
  staticSiblings: readonly string[] | null,
]

export type Segment = string | DynamicSegmentTuple

/**
 * Router state
 */
export type FlightRouterState = [
  segment: Segment,
  parallelRoutes: { [parallelRouterKey: string]: FlightRouterState },
  refreshState?: CompressedRefreshState | null,
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
  /**
   * Bitmask of PrefetchHint flags. Encodes route structure metadata:
   * root layout, loading boundaries, instant configs, and runtime prefetch
   * hints. Only set when non-zero.
   */
  prefetchHints?: number,
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
export type CompressedRefreshState = [url: string, renderedSearch: string]

export const enum PrefetchHint {
  // This segment has a runtime prefetch enabled (via unstable_instant with
  // prefetch: 'runtime'). Per-segment only, does not propagate to ancestors.
  HasRuntimePrefetch = 0b00001,
  // This segment or one of its descendants has an instant config defined
  // (any truthy unstable_instant, regardless of prefetch mode). Propagates
  // upward so the root segment reflects the entire subtree.
  SubtreeHasInstant = 0b00010,
  // This segment itself has a loading.tsx boundary.
  SegmentHasLoadingBoundary = 0b00100,
  // A descendant segment (but not this one) has a loading.tsx boundary.
  // Propagates upward so the root reflects the entire subtree.
  SubtreeHasLoadingBoundary = 0b01000,
  // This segment is the root layout of the application.
  IsRootLayout = 0b10000,
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
  // TODO: This field is no longer used. Remove it.
  loading: null,
  isPartial: boolean,
  /**
   * A thenable that resolves to the set of route params this segment accessed
   * during server rendering. Used by the client router to determine cache key
   * specificity - segments that only access certain params can be reused across
   * navigations where unaccessed params change.
   *
   * - null thenable: tracking was not enabled for this render (e.g., not a
   *   prerender). Treat conservatively - assume all params vary.
   * - Thenable resolves to empty Set: segment accesses no params (e.g., client
   *   components, or server components that don't read params). Can be shared
   *   across all param values.
   * - Thenable resolves to non-empty Set: segment depends on those params.
   *   Can only reuse when those specific params match.
   */
  varyParams: VaryParamsThenable | null,
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
  /** buildId, can be empty if the x-nextjs-build-id header is set */
  b?: string
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
  /**
   * headVaryParams - vary params for the head (metadata) of the response.
   */
  h: VaryParamsThenable | null
}

// Response from `createFromFetch` for normal rendering
export type NavigationFlightResponse = {
  /** buildId, can be empty if the x-nextjs-build-id header is set */
  b?: string
  /** flightData */
  f: FlightData
  /** prerendered */
  S: boolean
  /** renderedSearch */
  q: string
  /** couldBeIntercepted */
  i: boolean
  /** staleTime - Only present in dynamic runtime prefetch responses. */
  s?: AsyncIterable<number>
  /** headVaryParams */
  h: VaryParamsThenable | null
}

// Response from `createFromFetch` for server actions. Action's flight data can be null
export type ActionFlightResponse = {
  /** actionResult */
  a: ActionResult
  /** buildId, can be empty if the x-nextjs-build-id header is set */
  b?: string
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
