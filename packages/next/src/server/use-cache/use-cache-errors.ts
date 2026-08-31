export class UseCacheTimeoutError extends Error {
  constructor(route: string) {
    super(
      `Route "${route}": ` +
        `A \`"use cache"\` function took too long during prerendering. The most common cause is passing unresolved request-specific arguments, such as \`params\` or \`searchParams\`, into the cached function. Resolve the data before calling the function and pass only the values you need.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
    )
  }
}

export class UseCacheDeadlockError extends Error {
  constructor(route: string) {
    super(
      `Route "${route}": ` +
        `A \`"use cache"\` function is awaiting a promise created outside it. The same call completed when run in isolation, so a module-scoped value (often a top-level \`Map\` used to dedupe fetches) is most likely blocking it. \`"use cache"\` already dedupes calls with the same arguments. Remove the surrounding dedupe layer.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
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
