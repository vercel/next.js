export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
export {
  revalidateTag,
  revalidatePath,
} from 'next/dist/server/web/spec-extension/revalidate'
export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'
export { cacheTag as unstable_cacheTag } from 'next/dist/server/use-cache/cache-tag'

/**
 * Cache this `"use cache"` for a timespan defined by the `"default"` profile.
 * ```
 *   stale:      300 seconds (5 minutes)
 *   revalidate: 900 seconds (15 minutes)
 *   expire:     never
 * ```
 *
 * This cache may be stale on clients for 5 minutes before checking with the server.
 * If the server receives a new request after 15 minutes, start revalidating new values in the background.
 * It lives for the maximum age of the server cache. If this entry has no traffic for a while, it may serve an old value the next request.
 */
export function unstable_cacheLife(profile: 'default'): void

/**
 * Cache this `"use cache"` for a timespan defined by the `"seconds"` profile.
 * ```
 *   stale:      0 seconds
 *   revalidate: 1 seconds
 *   expire:     1 seconds
 * ```
 *
 * This cache may be stale on clients for 0 seconds before checking with the server.
 * This cache will expire after 1 seconds. The next request will recompute it.
 */
export function unstable_cacheLife(profile: 'seconds'): void

/**
 * Cache this `"use cache"` for a timespan defined by the `"minutes"` profile.
 * ```
 *   stale:      300 seconds (5 minutes)
 *   revalidate: 60 seconds (1 minute)
 *   expire:     3600 seconds (1 hour)
 * ```
 *
 * This cache may be stale on clients for 5 minutes before checking with the server.
 * If the server receives a new request after 1 minute, start revalidating new values in the background.
 * If this entry has no traffic for 1 hour it will expire. The next request will recompute it.
 */
export function unstable_cacheLife(profile: 'minutes'): void

/**
 * Cache this `"use cache"` for a timespan defined by the `"hours"` profile.
 * ```
 *   stale:      300 seconds (5 minutes)
 *   revalidate: 3600 seconds (1 hour)
 *   expire:     86400 seconds (1 day)
 * ```
 *
 * This cache may be stale on clients for 5 minutes before checking with the server.
 * If the server receives a new request after 1 hour, start revalidating new values in the background.
 * If this entry has no traffic for 1 day it will expire. The next request will recompute it.
 */
export function unstable_cacheLife(profile: 'hours'): void

/**
 * Cache this `"use cache"` for a timespan defined by the `"days"` profile.
 * ```
 *   stale:      300 seconds (5 minutes)
 *   revalidate: 86400 seconds (1 day)
 *   expire:     604800 seconds (1 week)
 * ```
 *
 * This cache may be stale on clients for 5 minutes before checking with the server.
 * If the server receives a new request after 1 day, start revalidating new values in the background.
 * If this entry has no traffic for 1 week it will expire. The next request will recompute it.
 */
export function unstable_cacheLife(profile: 'days'): void

/**
 * Cache this `"use cache"` for a timespan defined by the `"weeks"` profile.
 * ```
 *   stale:      300 seconds (5 minutes)
 *   revalidate: 604800 seconds (1 week)
 *   expire:     2592000 seconds (30 days)
 * ```
 *
 * This cache may be stale on clients for 5 minutes before checking with the server.
 * If the server receives a new request after 1 week, start revalidating new values in the background.
 * If this entry has no traffic for 30 days it will expire. The next request will recompute it.
 */
export function unstable_cacheLife(profile: 'weeks'): void

/**
 * Cache this `"use cache"` for a timespan defined by the `"max"` profile.
 * ```
 *   stale:      300 seconds (5 minutes)
 *   revalidate: 2592000 seconds (30 days)
 *   expire:     never
 * ```
 *
 * This cache may be stale on clients for 5 minutes before checking with the server.
 * If the server receives a new request after 30 days, start revalidating new values in the background.
 * It lives for the maximum age of the server cache. If this entry has no traffic for a while, it may serve an old value the next request.
 */
export function unstable_cacheLife(profile: 'max'): void

/**
 * Cache this `"use cache"` using a custom profile "...".
 * ```
 *   stale: ... // seconds
 *   revalidate: ... // seconds
 *   expire: ... // seconds
 * ```
 *
 * You can define custom profiles in `next.config.ts`.
 */
export function unstable_cacheLife(profile: string): void

/**
 * Cache this `"use cache"` using a custom timespan.
 * ```
 *   stale: ... // seconds
 *   revalidate: ... // seconds
 *   expire: ... // seconds
 * ```
 *
 * This is similar to Cache-Control: max-age=`stale`,s-max-age=`revalidate`,stale-while-revalidate=`expire-revalidate`
 *
 * If a value is left out, the lowest of other cacheLife() calls or the default, is used instead.
 */
export function unstable_cacheLife(profile: {
  /**
   * This cache may be stale on clients for ... seconds before checking with the server.
   */
  stale?: number
  /**
   * If the server receives a new request after ... seconds, start revalidating new values in the background.
   */
  revalidate?: number
  /**
   * If this entry has no traffic for ... seconds it will expire. The next request will recompute it.
   */
  expire?: number
}): void
