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

  /**
   * A shared mutable ref that tracks whether this segment should be scrolled
   * to. All new segments created during a single navigation share the same
   * ref. When any segment's scroll handler fires, it sets `current` to
   * `false` so no other segment scrolls for the same navigation.
   *
   * `null` means this segment is not a scroll target (e.g., a reused shared
   * layout segment).
   */
  scrollRef: ScrollRef | null

  /**
   * Globally-unique identifier minted from a monotonic counter when the
   * CacheNode is freshly created. Surfaced to user code as a string via
   * `useRouter().bfcacheId` and intended to be used as a React `key` to
   * opt out of Activity-based state preservation on fresh navigations.
   *
   * Preserved when the CacheNode is reused (shared layouts, refresh,
   * search/hash-only navigations) or restored from the BFCache during a
   * back/forward navigation.
   */
  bfcacheId: number
}

/**
 * A mutable ref shared across all new segments created during a single
 * navigation. Used to ensure that only one segment scrolls per navigation.
 */
export type ScrollRef = { current: boolean }

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
  // This segment or one of its descendants opts into Partial Prefetching.
  // Currently set when a truthy unstable_instant config is present on any
  // segment in the subtree (regardless of prefetch mode). Propagates upward
  // so the root segment reflects the entire subtree.
  SubtreeHasPartialPrefetching = 0b00010,
  // This segment itself has a loading.tsx boundary.
  SegmentHasLoadingBoundary = 0b00100,
  // A descendant segment (but not this one) has a loading.tsx boundary.
  // Propagates upward so the root reflects the entire subtree.
  SubtreeHasLoadingBoundary = 0b01000,
  // This segment is the root layout of the application.
  IsRootLayout = 0b10000,
  // This segment's response includes its parent's data inlined into it.
  // Set at build time by the segment size measurement pass.
  ParentInlinedIntoSelf = 0b100000,
  // This segment's data is inlined into one of its children — don't fetch
  // it separately. Set at build time by the segment size measurement pass.
  InlinedIntoChild = 0b1000000,
  // On a __PAGE__: this page's response includes the head (metadata/viewport)
  // at the end of its SegmentPrefetch[] array.
  HeadInlinedIntoSelf = 0b10000000,
  // On the root hint node: the head was NOT inlined into any page — fetch
  // it separately. Absence of this bit means the head is bundled into a page.
  HeadOutlined = 0b100000000,
  // The inlining hints in this tree may be stale because the tree was
  // generated before collectPrefetchHints ran (e.g. the initial RSC payload
  // for a fully static page at build time). When writing this tree into the
  // cache, the route entry should be immediately expired so it gets
  // re-fetched with correct hints. Only set during build-time prerendering,
  // never at runtime.
  InliningHintsStale = 0b1000000000,
  // This segment has unstable_instant = false, opting out of all
  // prefetching entirely (neither static nor runtime).
  PrefetchDisabled = 0b10000000000,
  // This segment or one of its descendants has runtime prefetch enabled
  // (HasRuntimePrefetch). Propagates upward so the root reflects the
  // entire subtree.
  SubtreeHasRuntimePrefetch = 0b100000000000,
  // This segment or one of its descendants prefetches "eagerly" — i.e. its
  // effective prefetch strategy is anything other than 'partial' or
  // 'force-runtime'. Used by App Shells: a non-eager subtree relies on the
  // shared app shell and skips its Speculative prefetch. Propagates upward so
  // the root reflects the entire subtree.
  SubtreeHasEagerPrefetch = 0b1000000000000,
}

/**
 * Bitmask for checking whether a segment's static prefetch is skipped. Matches
 * if EITHER bit is set — i.e. the segment uses runtime prefetching
 * (HasRuntimePrefetch) OR prefetching is disabled entirely (PrefetchDisabled,
 * e.g. unstable_instant = false). The segment participates in the bundle chain
 * but with null data.
 *
 * Usage: `(hints & StaticPrefetchDisabled) !== 0`
 */
export const StaticPrefetchDisabled =
  PrefetchHint.HasRuntimePrefetch | PrefetchHint.PrefetchDisabled

/**
 * The subset of PrefetchHint bits that propagate upward from a child segment to
 * its ancestors (as opposed to segment-local bits like SegmentHasLoadingBoundary
 * or IsRootLayout). Used to clear stale propagated bits before re-deriving them
 * from a node's children.
 */
export const SubtreePrefetchHints =
  PrefetchHint.SubtreeHasPartialPrefetching |
  PrefetchHint.SubtreeHasLoadingBoundary |
  PrefetchHint.SubtreeHasRuntimePrefetch |
  PrefetchHint.SubtreeHasEagerPrefetch

/**
 * Folds a child segment's prefetch hints into its parent's, propagating the
 * "subtree" flags. A child's segment-local flag (e.g. it has a loading boundary,
 * or it has a runtime prefetch) becomes the corresponding "subtree" flag on the
 * parent, so the root segment ends up reflecting the entire subtree.
 *
 * Used wherever a route tree is assembled bottom-up: on the server when building
 * a prefetch tree (createFlightRouterStateFromLoaderTree) and on the client when
 * merging a navigation patch into the existing tree (convertServerPatchToFullTree).
 * Keep these in sync by routing both through this helper.
 */
export function propagateSubtreeBits(
  parentHints: number,
  childHints: number
): number {
  if (childHints & PrefetchHint.SubtreeHasPartialPrefetching) {
    parentHints |= PrefetchHint.SubtreeHasPartialPrefetching
  }
  // A child with a loading boundary (directly, or anywhere in its subtree) makes
  // this a SubtreeHasLoadingBoundary on the parent.
  if (
    childHints &
    (PrefetchHint.SegmentHasLoadingBoundary |
      PrefetchHint.SubtreeHasLoadingBoundary)
  ) {
    parentHints |= PrefetchHint.SubtreeHasLoadingBoundary
  }
  // Likewise for runtime prefetch.
  if (
    childHints &
    (PrefetchHint.HasRuntimePrefetch | PrefetchHint.SubtreeHasRuntimePrefetch)
  ) {
    parentHints |= PrefetchHint.SubtreeHasRuntimePrefetch
  }
  // And for eager prefetch. The bit is set directly on each eager segment, so
  // there's no separate segment-local flag — propagate it as-is.
  if (childHints & PrefetchHint.SubtreeHasEagerPrefetch) {
    parentHints |= PrefetchHint.SubtreeHasEagerPrefetch
  }
  return parentHints
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

/**
 * Per-route prefetch hints computed at build time. Mirrors the shape of the
 * loader tree so hints can be traversed in parallel during router state
 * creation. Each node stores a bitmask of PrefetchHint flags
 * (ParentInlinedIntoSelf, InlinedIntoChild) computed by the segment size
 * measurement pass.
 *
 * Persisted to prefetch-hints.json as Record<string, PrefetchHints> (keyed
 * by route pattern) and loaded at server startup.
 */
export type PrefetchHints = {
  /** Bitmask of PrefetchHint flags for this segment. */
  hints: number
  /** Child hint nodes, keyed by parallel route key. */
  slots: Record<string, PrefetchHints> | null
}

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
  /** supportsPerSegmentPrefetching */
  S: boolean
  /**
   * headVaryParams - vary params for the head (metadata) of the response.
   */
  h: VaryParamsThenable | null
  /** staleTime in seconds - Only present when Cache Components is enabled. */
  s?: AsyncIterable<number>
  /** staticStageByteLength - Resolves when the static stage ends. */
  l?: Promise<number>
  /**
   * shellByteLength - Resolves when the shell stage ends.
   * If it resolves to null, then the shell is the same as the main response.
   * */
  a?: Promise<number | null>
  /** runtimePrefetchStream — Embedded runtime prefetch Flight stream. */
  p?: ReadableStream<Uint8Array>
  /**
   * dynamicStaleTime — Per-page BFCache stale time in seconds, from
   * `unstable_dynamicStaleTime`. Only included for dynamic renders. Controls
   * how long the client router cache retains dynamic navigation data. This is
   * distinct from the `s` field, which controls segment cache (prefetch)
   * staleness.
   */
  d?: number
}

// Response from `createFromFetch` for normal rendering
export type NavigationFlightResponse = {
  /** buildId, can be empty if the x-nextjs-build-id header is set */
  b?: string
  /** flightData */
  f: FlightData
  /** supportsPerSegmentPrefetching */
  S: boolean
  /** renderedSearch */
  q: string
  /** couldBeIntercepted */
  i: boolean
  /** staleTime - Only present in dynamic runtime prefetch responses. */
  s?: AsyncIterable<number>
  /** staticStageByteLength - Resolves when the static stage ends. */
  l?: Promise<number>
  /**
   * shellByteLength - Resolves when the shell stage ends.
   * If it resolves to null, then the shell is the same as the main response.
   * */
  a?: Promise<number | null>
  /** headVaryParams */
  h: VaryParamsThenable | null
  /** runtimePrefetchStream — Embedded runtime prefetch Flight stream. */
  p?: ReadableStream<Uint8Array>
  /**
   * dynamicStaleTime — Per-page BFCache stale time in seconds, from
   * `unstable_dynamicStaleTime`. Only included for dynamic renders. Controls
   * how long the client router cache retains dynamic navigation data. This is
   * distinct from the `s` field, which controls segment cache (prefetch)
   * staleness.
   */
  d?: number
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

export type InstantCookie =
  // pending (waiting to capture)
  | [captured: 0, id: string]
  // captured MPA page load
  | [captured: 1, id: string, state: null]
  // captured SPA navigation (from/to route trees)
  | [
      captured: 1,
      id: string,
      state: { from: FlightRouterState; to: FlightRouterState | null },
    ]
