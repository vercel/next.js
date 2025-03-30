/**
 * Entry point to the Segment Cache implementation.
 *
 * All code related to the Segment Cache lives `segment-cache-impl` directory.
 * Callers access it through this indirection.
 *
 * This is to ensure the code is dead code eliminated from the bundle if the
 * flag is disabled.
 *
 * TODO: This is super tedious. Since experimental flags are an essential part
 * of our workflow, we should establish a better pattern for dead code
 * elimination. Ideally it would be done at the bundler level, like how React's
 * build process works. In the React repo, you don't even need to add any extra
 * configuration per experiment — if the code is not reachable, it gets stripped
 * from the build automatically by Rollup. Or, shorter term, we could stub out
 * experimental modules at build time by updating the build config, i.e. a more
 * automated version of what I'm doing manually in this file.
 */

export type { NavigationResult } from './segment-cache-impl/navigation'
export type { PrefetchTask } from './segment-cache-impl/scheduler'

const notEnabled: any = () => {
  throw new Error(
    'Segment Cache experiment is not enabled. This is a bug in Next.js.'
  )
}

export const prefetch: typeof import('./segment-cache-impl/prefetch').prefetch =
  process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? function (...args) {
        return require('./segment-cache-impl/prefetch').prefetch(...args)
      }
    : notEnabled

export const navigate: typeof import('./segment-cache-impl/navigation').navigate =
  process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? function (...args) {
        return require('./segment-cache-impl/navigation').navigate(...args)
      }
    : notEnabled

export const revalidateEntireCache: typeof import('./segment-cache-impl/cache').revalidateEntireCache =
  process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? function (...args) {
        return require('./segment-cache-impl/cache').revalidateEntireCache(
          ...args
        )
      }
    : notEnabled

export const getCurrentCacheVersion: typeof import('./segment-cache-impl/cache').getCurrentCacheVersion =
  process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? function (...args) {
        return require('./segment-cache-impl/cache').getCurrentCacheVersion(
          ...args
        )
      }
    : notEnabled

export const schedulePrefetchTask: typeof import('./segment-cache-impl/scheduler').schedulePrefetchTask =
  process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? function (...args) {
        return require('./segment-cache-impl/scheduler').schedulePrefetchTask(
          ...args
        )
      }
    : notEnabled

export const cancelPrefetchTask: typeof import('./segment-cache-impl/scheduler').cancelPrefetchTask =
  process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? function (...args) {
        return require('./segment-cache-impl/scheduler').cancelPrefetchTask(
          ...args
        )
      }
    : notEnabled

export const bumpPrefetchTask: typeof import('./segment-cache-impl/scheduler').bumpPrefetchTask =
  process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? function (...args) {
        return require('./segment-cache-impl/scheduler').bumpPrefetchTask(
          ...args
        )
      }
    : notEnabled

export const createCacheKey: typeof import('./segment-cache-impl/cache-key').createCacheKey =
  process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? function (...args) {
        return require('./segment-cache-impl/cache-key').createCacheKey(...args)
      }
    : notEnabled

/**
 * Below are public constants. They're small enough that we don't need to
 * DCE them.
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
   * Assigned to any visible link that was hovered/touched at some point. This
   * is not removed on mouse exit, because a link that was momentarily
   * hovered is more likely to to be interacted with than one that was not.
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
