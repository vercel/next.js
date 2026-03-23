/**
 * Cache Stage
 *
 * Represents the prefetch stage level of a cache entry or response. Shared
 * between client and server.
 *
 * Note that this does not guarantee all content up to a given stage is
 * present in the response. It only indicates that the server did not
 * intentionally omit anything before this level. For example, static
 * prefetches omit request-specific info like cookies because they're not
 * accessible during static prerendering — that's different from
 * intentionally omitting content to control prefetching costs at runtime.
 *
 * Currently binary (Default vs Max), but may expand to more levels as
 * additional stage boundaries are supported.
 */
export const enum CacheStage {
  /** The default prefetching strategy. */
  Default = 0,
  /** Everything that is possibly prefetchable. */
  Max = 1,
}
