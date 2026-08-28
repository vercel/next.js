export class UseCacheTimeoutError extends Error {
  constructor() {
    super(
      'Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".'
    )
  }
}

export class UseCacheDeadlockError extends Error {
  constructor() {
    super(
      'Filling a "use cache" entry appears to be stuck on shared state from the outer render scope. The same function completed when run in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments — within a request and across requests on the same server instance — so the surrounding dedupe layer is both unnecessary and the likely cause. Remove it and rely on "use cache" alone for deduping.'
    )
  }
}

/**
 * Used purely as `cause` for the nested-dynamic cache error: its captured stack
 * points at the inner `"use cache"` invocation that propagated a dynamic cache
 * life up to the outer cache. Constructed eagerly in `cache()` while the caller
 * is still on the synchronous stack — see use-cache-wrapper.ts.
 */
export class NestedDynamicUseCacheError extends Error {
  constructor() {
    super(
      'This "use cache" has a dynamic cache life that was propagated to its parent.'
    )
    this.name = 'Nested dynamic "use cache"'
  }
}
