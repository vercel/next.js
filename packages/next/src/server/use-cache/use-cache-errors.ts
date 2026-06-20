export class UseCacheTimeoutError extends Error {
  constructor() {
    super(
      `Filling a \`"use cache"\` entry took too long. The most common cause is reading request data (\`params\`, \`searchParams\`, \`cookies()\`, \`headers()\`) inside the cached function. Read it outside and pass what you need as an argument.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
    )
  }
}

export class UseCacheDeadlockError extends Error {
  constructor() {
    super(
      `A \`"use cache"\` entry is awaiting a promise created outside the cached function. The same call completed when run in isolation, so a module-scoped value (often a top-level \`Map\` used to dedupe fetches) is most likely blocking it. \`"use cache"\` already dedupes calls with the same arguments. Remove the surrounding dedupe layer.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
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
