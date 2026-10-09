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

/**
 * How far a render went, named after the server's render stages. Each stage
 * includes everything before it. A link asks for a stage; a cache entry
 * records the stage its payload reached.
 *
 * Ordered, so two stages can be compared. Never compare a stage with a
 * `Completeness`.
 */
export const enum AppStage {
  // The app shell: shared by every link to the route, so param-dependent
  // content is reduced to fallbacks.
  Shell = 0,
  // Up to where `prefetch()` resolves.
  Prefetch = 1,
  // Up to where `navigation()` resolves: what a navigation renders,
  // minus dynamic holes.
  Navigation = 2,
}

/**
 * What's still missing at an entry's stage. Each level promises everything
 * the previous one does.
 *
 * Ordered, so two values can be compared. Never compare it with an
 * `AppStage`.
 */
export const enum Completeness {
  // Static content only. A runtime prefetch at this stage could add content.
  NeedsRuntime = 0,
  // Everything cacheable up to this stage is present. Only dynamic holes are
  // left, which prefetches never fill.
  CacheComplete = 1,
  // Nothing extra to request during a navigation: a segment with no holes, a
  // legacy full or loading-boundary prefetch, or a back/forward cache entry.
  // Implies the navigation stage.
  FullyComplete = 2,
}
