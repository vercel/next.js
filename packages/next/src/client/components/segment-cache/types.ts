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
  // (i.e. if it's likely that it contains more data)
  LoadingBoundary = 0,
  PPR = 1,
  PPRRuntime = 2,
  Full = 3,
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
