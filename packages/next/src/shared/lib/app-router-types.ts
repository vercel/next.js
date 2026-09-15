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

import type { VaryParamsIterable } from './segment-cache/vary-params-decoding'
import type { FullTransportData, PartialTransportData } from './rsc-transport'

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
   * root layout, loading boundaries, instant configs, and prefetch strategy
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
  // NOTE: The 0b00001 bit was previously HasRuntimePrefetch (prefetch:
  // 'allow-runtime'). Partial Prefetching now implies runtime completeness
  // for every segment, so the bit was removed. Do not reuse it without
  // considering caches populated by older builds.

  // This segment or one of its descendants opts into Partial Prefetching, i.e.
  // uses the two-phase (Shell then Speculative) prefetch flow. Set when
  // `prefetch` is 'partial' (including the default implied by the global
  // `partialPrefetching` config). Propagates upward so the root segment
  // reflects the entire subtree.
  //
  // Partial Prefetching segments require RUNTIME COMPLETENESS: a prefetch
  // isn't considered done for such a segment until an entry at least as
  // complete as a runtime response exists. This does NOT mean the segment
  // lacks static data — the server emits static data unconditionally, and the
  // scheduler may attempt a static prefetch first (per
  // ShouldAttemptStaticPrefetch), issuing the runtime request only if the
  // static response's own `needsRuntimeRequest` signal says it would
  // return more.
  SubtreeHasPartialPrefetching = 0b00010,
  // This segment itself has a loading.tsx boundary.
  SegmentHasLoadingBoundary = 0b00100,
  // A descendant segment (but not this one) has a loading.tsx boundary.
  // Propagates upward so the root reflects the entire subtree.
  SubtreeHasLoadingBoundary = 0b01000,
  // This segment is at or above the application's root layout — the root layout
  // segment itself and all of its ancestors. A dynamic param in one of these
  // segments is a "root param".
  IsRootLayoutOrAbove = 0b10000,
  // This segment's response includes its parent's data inlined into it.
  // Set at build time by the segment size measurement pass.
  ParentInlinedIntoSelf = 0b100000,
  // This segment's data is inlined into one of its children — don't fetch
  // it separately. Set at build time by the segment size measurement pass.
  InlinedIntoChild = 0b1000000,
  // On a __PAGE__: this page's response includes the head (metadata/viewport)
  // in its transport data (PartialTransportData's `h`).
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
  // This segment has prefetch = 'force-disabled'. The opt-out is passive
  // and applies to this segment only: it never INITIATES a prefetch — no
  // static data is emitted or fetched, and it's never the reason a runtime
  // prefetch spawns — but it may ride along in a runtime response issued on
  // another segment's behalf. Descendants prefetch normally.
  //
  // TODO: Also set as an internal fallback when the prefetch hints manifest
  // is unavailable (see #91407 mitigations), which only means "no static
  // prefetch data exists" — not a user opt-out. Split the fallback into its
  // own bit so the two intents can diverge.
  PrefetchDisabled = 0b10000000000,
  // NOTE: The 0b100000000000 bit was previously SubtreeHasRuntimePrefetch.
  // Partial Prefetching now implies runtime completeness for every segment
  // (see SubtreeHasPartialPrefetching), so the bit was removed. Do not reuse
  // it without considering caches populated by older builds.

  // NOTE: The 0b1000000000000 bit was previously SubtreeHasEagerPrefetch
  // (prefetch: 'unstable_eager', plus every segment that did not opt into
  // Partial Prefetching). After `unstable_eager` was removed, it's no longer needed.

  // This segment or one of its descendants exports `instant = false`,
  // explicitly opting out of Partial Prefetching. Propagates upward so the root
  // reflects the entire subtree. Used only to suppress the dev-time
  // `<Link prefetch={true}>` warning — unlike PrefetchDisabled, it has no effect
  // on the actual prefetch behavior.
  SubtreeHasInstantFalse = 0b10000000000000,
  // The client should attempt a static prefetch for this route: the
  // build-time prerender did not access any runtime data (cookies, headers,
  // searchParams, ...), so a static prefetch is expected to be as complete
  // as a runtime one. A fallback-param access only unsets the bit when the
  // route can never be upgraded from a fallback to a concrete prerender —
  // on an upgradeable route, ISR later produces the concrete prerender a
  // static attempt would hit (until then, the static responses' own
  // signal reports the insufficiency per response). Purely advisory, and
  // both error directions are safe: if set when a runtime request is
  // actually needed, that same response-level signal (the load-bearing
  // `needsRuntimeRequest` promise combined with each segment's `isPartial`)
  // directs the client to follow up — the cost is a wasted static attempt.
  // If unset when static would have sufficed, the client goes straight to a
  // runtime prefetch, which is a superset of the static response — the cost
  // is only reduced cacheability. Like the other bits, this one is computed
  // once per build and stays constant for the build's lifetime; it rides
  // the prefetch-hints manifest into every response that carries hints —
  // `/_tree` prefetch responses and the FlightRouterState of dynamic
  // navigations alike. (Routes missing from the manifest — see the #91407
  // fallbacks — simply never carry it.) Set on every node of the tree, but
  // does not propagate.
  ShouldAttemptStaticPrefetch = 0b100000000000000,
}

/**
 * Bitmask for checking whether a segment's static prefetch is skipped — i.e.
 * the server emits no static data for it (its node in a segment response
 * carries identity only, and it participates in a bundle only as a
 * pass-through) and the client never issues a static request for it.
 *
 * Static prefetching is disabled ONLY by `prefetch: 'force-disabled'`
 * (PrefetchDisabled). Notably, Partial Prefetching segments DO have static
 * data even though they require runtime completeness: the server emits it
 * unconditionally — it can't be gated on the ShouldAttemptStaticPrefetch
 * hint, because which segments carry static data must be deterministic
 * from build-time config. A runtime request may still be needed for the
 * segment, but the scheduler may attempt a static prefetch first (per the
 * ShouldAttemptStaticPrefetch hint) and skip the runtime request if the
 * static response proves sufficient.
 *
 * Usage: `(hints & StaticPrefetchDisabled) !== 0`
 */
export const StaticPrefetchDisabled = PrefetchHint.PrefetchDisabled

/**
 * The subset of PrefetchHint bits that propagate upward from a child segment to
 * its ancestors (as opposed to segment-local bits like SegmentHasLoadingBoundary
 * or IsRootLayoutOrAbove). Used to clear stale propagated bits before re-deriving them
 * from a node's children.
 */
export const SubtreePrefetchHints =
  PrefetchHint.SubtreeHasPartialPrefetching |
  PrefetchHint.SubtreeHasLoadingBoundary |
  PrefetchHint.SubtreeHasInstantFalse

/**
 * Folds a child segment's prefetch hints into its parent's, propagating the
 * "subtree" flags. A child's segment-local flag (e.g. it has a loading
 * boundary) becomes the corresponding "subtree" flag on the parent, so the
 * root segment ends up reflecting the entire subtree.
 *
 * Used wherever a route tree is assembled bottom-up: on the server when building
 * a transport tree (createTransportTreeFromLoaderTree) and on the client when
 * overlaying a navigation response onto the existing tree
 * (createNavigationSeed). Keep these in sync by routing both through
 * this helper.
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
  // And for `instant = false`. The bit is set directly on each opted-out
  // segment, so there's no separate segment-local flag — propagate it as-is.
  if (childHints & PrefetchHint.SubtreeHasInstantFalse) {
    parentHints |= PrefetchHint.SubtreeHasInstantFalse
  }
  return parentHints
}

/**
 * A path through the segment tree: a repeating sequence of segment and
 * parallel route key. Used by the client to address positions in the
 * CacheNode tree (see layout-router).
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
  /** initial transport data — the tree + head for hydration */
  t: FullTransportData
  /** missingSlots */
  m: Set<string> | undefined
  /** GlobalError */
  G: [React.ComponentType<any>, React.ReactNode | undefined]
  /** supportsPerSegmentPrefetching */
  S: boolean
  /**
   * rootVaryParams - the root params accessed anywhere in the response, emitted
   * once. The client unions these into the head and every segment's vary
   * params, rather than the server folding them into each set.
   */
  r?: VaryParamsIterable
  /** staleTime in seconds - Only present when Cache Components is enabled. */
  s?: AsyncIterable<number>
  /**
   * runtimeDataAccessed — whether the render has accessed a data source that
   * hangs during a static prerender but would resolve during a runtime
   * prerender (cookies, headers, fallback params, searchParams, ...). The
   * flag is monotonic (false → true, at most once), so it's encoded as a
   * promise: resolved `true` at the moment of first access — the fulfillment
   * row's position in the stream records the stage the access happened in —
   * or resolved `false` when the prerender completes without one, a row that
   * lands past every stage boundary. A truncated (shell) decode therefore
   * reads the answer as of the shell stage: fulfilled `true` iff the access
   * happened during a stage it includes, pending (⇒ no access) otherwise.
   * Unlike an async iterable, a pending promise costs Flight no abort
   * listener on the render. Used when generating per-segment prefetch
   * responses (forwarded as each response's own `u`).
   * The build-constant `PrefetchHint.ShouldAttemptStaticPrefetch` is
   * tracked directly on the prerender store instead (its
   * `shouldAttemptStaticPrefetch` cell) — it needs neither stream
   * positioning nor this flag's param/non-param blindness. Only present
   * for static prerenders when Cache Components is enabled.
   */
  u?: Promise<boolean>
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
  /**
   * revealAfter (dev only). Resolves once the server has flushed the
   * shell-stage content to the stream (static shell, or runtime-prefetchable
   * shell for runtime-prefetch routes), or earlier on a cache miss. The client
   * decodes this from the payload and defers resolving the response's deferred
   * RSCs on it, so a boundary's children aren't revealed before their row has
   * been decoded (which would flush a premature Suspense fallback). Its
   * resolution row follows the children's row in the payload, so the children
   * are decoded by the time the client unblocks. The HTML render gates on the
   * same signal server-side instead of reading this field.
   */
  _revealAfter?: Promise<void>
}

/**
 * The fields shared by every navigation/prefetch response kind. Not used
 * directly — see NavigationFlightResponse (the general form) and the
 * per-context aliases DynamicNavigationFlightResponse and
 * PrefetchFlightResponse below. Fields that only apply to some response
 * kinds are optional.
 */
type NavigationFlightResponseBase = {
  /** buildId, can be empty if the x-nextjs-build-id header is set */
  b?: string
  /**
   * transport data — present iff the response carries a SPA payload.
   * Absent when the response renders nothing (see `n` for MPA navigations).
   *
   * In a per-segment prefetch response the tree is root-anchored with `d`
   * present on exactly the segments whose data is bundled into the response
   * (the requested segment and any ancestors inlined into it, per the
   * build-time prefetch hints); the remaining nodes — the spine above the
   * bundle, and segments with static prefetching disabled — carry identity
   * but no data. Every node carries the same hints the `/_tree` response
   * emits for it, so the tree decodes like any other transport tree. Data
   * nodes use the staged encodings: `p` is a promise and `s` is present
   * (see TransportSegmentData). The head (`h`) is present iff it's bundled
   * into the response: the standalone head response (whose tree is a bare
   * root identity), or a page response whose bundle accepted the head
   * (PrefetchHint.HeadInlinedIntoSelf).
   */
  t?: PartialTransportData
  /**
   * MPA navigation URL — present iff the client should hard-navigate to
   * this URL instead of applying a SPA payload. Reserved: no server path
   * emits it today (hard navigations are signaled by non-RSC content types
   * or a build-id mismatch), but the client honors it.
   */
  n?: string
  /** staleTime - Only present in live-render responses.
   * Per-segment prefetch responses carry staleTime per node instead (see
   * TransportSegmentData). */
  s?: AsyncIterable<number>
  /** staticStageByteLength - Resolves when the static stage ends. */
  l?: Promise<number>
  /**
   * shellByteLength - Resolves when the shell stage ends.
   * If it resolves to null, then the shell is the same as the main response.
   *
   * In a per-segment prefetch response this is the shell byte boundary the
   * client uses for the shell double-decode: re-decoding the buffered
   * response truncated at the offset yields the shell variant of every
   * segment (param-dependent content reduced to still-pending references).
   * `0` means no shell exists (the page wasn't produced by staged
   * rendering) — never a valid offset, so it doubles as the "none"
   * sentinel. The resolution row flushes past the boundary, so a truncated
   * shell decode reads it as pending, which is harmless. The client's
   * buffered read leans on the same fact from the other side: 0 read from
   * an unfulfilled `a` implies a bug — see the shell-extraction comment in
   * fetchAndWritePerSegmentPrefetchResponse (segment-cache/cache.ts).
   */
  a?: Promise<number | null>
  /**
   * needsRuntimeRequest — presence means the response carries a stage-scoped
   * runtime-data verdict. Per-segment prefetch responses always emit one,
   * and so does any prerendered page payload, which embeds the prerender's
   * runtime-data probe — that covers navigation responses served from
   * prerender output and the truncated initial payload alike. Live renders
   * emit none. Only per-segment responses additionally promise-encode the
   * head's partiality (see TransportSegmentData). The value is the page's
   * runtime-data-access flag (the page payload's own `u`; per-segment
   * responses forward it from the staged decode of the page data).
   * Fulfilled `true` means a runtime prefetch would return more
   * than this static response; pending or fulfilled `false` means it
   * wouldn't. Promise-encoded so the answer rewinds with a truncated
   * decode: the fulfillment row lands on the same side of the shell byte
   * boundary (`a`) as the access it records. Tracking is page-global, so it
   * lives on the response, not on each segment; per-segment granularity
   * comes from combining it with each segment's partiality:
   * needsRuntimeRequest(segment) = (settled true) && (isPartial pending).
   * The derived value must never falsely claim that no runtime request is
   * needed, so every fallback is conservative: pages that carry no `u`
   * (legacy render paths) forward an already-resolved `true`. Unlike the
   * build-constant prefetch hints, this is computed per render and may
   * change between responses for the same build — it reflects THIS
   * response.
   */
  u?: Promise<boolean>
  /**
   * shellUsedSessionData — present only in runtime-shell prefetch
   * responses: true if resolving session data unblocked new content in the
   * shell. Only meaningful where there's a proper session shell.
   * Promise-encoded so the answer rewinds with a truncated decode.
   * Currently has no client consumer; emitted for forward compatibility.
   */
  w?: Promise<boolean>
  /**
   * isUpgradeableISRFallback — present (true) iff this is a per-segment
   * prefetch response generated from a fallback shell render (i.e. the page
   * had not yet been prerendered with concrete params, so it was rendered
   * with `fallbackRouteParams`). The client uses this to schedule a retry,
   * since a more complete version may become available once the server's
   * background regeneration finishes.
   *
   * Note: this is distinct from per-segment partiality. A fully-prerendered
   * PPR page can have partial segments (dynamic holes filled by runtime
   * requests); those should not be retried. This flag specifically means a
   * more complete *static* version may become available.
   */
  f?: boolean
  /**
   * rootVaryParams - the root params accessed anywhere in the response, emitted
   * once. The client unions these into the head and every segment's vary
   * params.
   */
  r?: VaryParamsIterable
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
  /**
   * revealAfter (dev only). Resolves once the server has flushed the
   * shell-stage content to the stream (static shell, or runtime-prefetchable
   * shell for runtime-prefetch routes), or earlier on a cache miss. The client
   * decodes this from the payload and defers resolving the response's deferred
   * RSCs on it, so a boundary's children aren't revealed before their row has
   * been decoded (which would flush a premature Suspense fallback). Its
   * resolution row follows the children's row in the payload, so the children
   * are decoded by the time the client unblocks. The HTML render gates on the
   * same signal server-side instead of reading this field.
   */
  _revealAfter?: Promise<void>
}

/**
 * A live-render response: navigations, refreshes, runtime prefetches, and
 * dynamic route tree prefetches. Live renders always emit `S`, `q`, and `i`,
 * so they're required here — used at the sites that produce these responses
 * (app-render) and the decode sites that only ever receive them, so a
 * malformed response fails the type rather than being masked by a fallback.
 */
export type DynamicNavigationFlightResponse = NavigationFlightResponseBase & {
  /**
   * supportsPerSegmentPrefetching — whether per-segment prefetch responses
   * can be served for this route.
   */
  S: boolean
  /** renderedSearch */
  q: string
  /** couldBeIntercepted */
  i: boolean
}

/**
 * A per-segment prefetch response served from static storage: the `/_tree`
 * route tree prefetch and the per-segment responses generated by
 * collect-segment-data. Never carries `S` (implied by the response's
 * existence), `q` (search-agnostic; the client writes these responses into
 * the cache using the rendered search already recorded on the route tree
 * entry), or `i` (the client reads the Vary header instead). Structurally
 * the shared base — the alias marks the response kind at the sites that
 * produce and decode it.
 */
export type PrefetchFlightResponse = NavigationFlightResponseBase

/**
 * The general form: a response that may be either kind, for the flows that
 * handle both (the `/_tree` fetch, which receives a live render when
 * per-segment prefetching is unsupported, and the shared cache-write path).
 * Both aliases above are assignable to it.
 */
export type NavigationFlightResponse = NavigationFlightResponseBase & {
  /**
   * supportsPerSegmentPrefetching — present in live-render responses;
   * absent in per-segment prefetch responses served from static storage
   * (where it's implied by the response's existence).
   */
  S?: boolean
  /**
   * renderedSearch — present in live-render responses; absent in
   * per-segment prefetch responses, which are search-agnostic (the client
   * writes them into the cache using the rendered search already recorded
   * on the route tree entry).
   */
  q?: string
  /**
   * couldBeIntercepted — present in live-render responses; absent in
   * per-segment prefetch responses (the client reads the Vary header
   * instead).
   */
  i?: boolean
}

// Response from `createFromFetch` for server actions.
export type ActionFlightResponse = {
  /** actionResult */
  a: ActionResult
  /** buildId, can be empty if the x-nextjs-build-id header is set */
  b?: string
  /**
   * transport data — present iff the action response re-rendered the page.
   * Absent when the action rendered nothing (see `n` for MPA navigations).
   */
  t?: PartialTransportData
  /**
   * MPA navigation URL — present iff the client should hard-navigate to
   * this URL instead of applying a SPA payload. Reserved: no server path
   * emits it today, but the client honors it.
   */
  n?: string
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
