/**
 * Shared types and constants for the Segment Cache.
 */

export const enum NavigationResultTag {
  MPA,
  Success,
  NoOp,
  Async,
}

/**
 * The priority of the prefetch task. Higher numbers are higher priority.
 */
export const enum PrefetchPriority {
  /**
   * Assigned to the most recently hovered/touched link. Special network
   * bandwidth is reserved for this task only. There's only ever one Intent-
   * priority task at a time; when a new Intent task is scheduled, the previous
   * one is bumped down to Default.
   */
  Intent = 2,
  /**
   * The default priority for prefetch tasks.
   */
  Default = 1,
  /**
   * Assigned to tasks when they spawn non-blocking background work, like
   * revalidating a partially cached entry to see if more data is available.
   */
  Background = 0,
}

export const enum FetchStrategy {
  // Deliberately ordered so we can easily compare two segments
  // and determine if one segment is "more specific" than another
  // (i.e. if it's likely that it contains more data). See
  // canNewFetchStrategyProvideMoreContent in cache.ts for what each tier can
  // contain relative to the others.
  //
  // Full and LoadingBoundary belong to the non-Partial-Prefetching regime:
  // they're only relevant in modes where the staging concepts (shell tiers,
  // runtime prefetches) don't apply. They sit on this single ordered ladder
  // as an accepted convenience, because cross-regime comparisons exist
  // (e.g. canNewFetchStrategyProvideMoreContent).
  //
  // These numeric values are client-internal and never cross the wire — the
  // `next-router-prefetch` request header values are mapped explicitly in
  // fetchSegmentPrefetchesUsingRuntimeRequest (cache.ts) — so the members can
  // be renumbered freely as long as the relative order is preserved.
  LoadingBoundary = 0,
  // The shell-stage variant extracted from a static per-segment prefetch
  // response: every segment's param-dependent content is reduced to pending
  // references that render as the param fallback, keyed at the shell vary
  // paths (only root params kept concrete). The Shell PHASE that issues
  // these requests targets the conceptual App Shell; the strategy itself is
  // just this mechanical truncation and keying. Less complete than
  // RuntimeShell — a static response can't include content that depends on
  // session data (cookies, headers) — and less complete than PPR at concrete
  // paths, which includes prerendered param-dependent content.
  StaticShell = 1,
  RuntimeShell = 2,
  PPR = 3,
  PPRRuntime = 4,
  Full = 5,
}

/**
 * A subset of fetch strategies used for prefetch tasks.
 * A prefetch task can't know if it should use `PPR` or `LoadingBoundary`
 * until we complete the initial tree prefetch request, so we use `PPR` to signal both cases
 * and adjust it based on the route when actually fetching.
 * */
export type PrefetchTaskFetchStrategy =
  | FetchStrategy.PPR
  | FetchStrategy.PPRRuntime
  | FetchStrategy.Full
