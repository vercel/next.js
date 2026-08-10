import { setErrorMessage } from '../../lib/format-server-error'

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

/**
 * React Flight reports non-serializable functions with a Client Components
 * message. Inside `"use cache"` that framing is misleading — the real issue is
 * the cache serialization boundary. Append a clearer hint while preserving
 * React's function annotation (e.g. `[function fn]`).
 */
const REACT_FUNCTION_SERIALIZATION_ERROR =
  'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.'

const USE_CACHE_FUNCTION_DOCS_URL =
  'https://nextjs.org/docs/app/api-reference/directives/use-cache'

// Docs: return values may include JSX; bare functions are unsupported (except
// pass-through args). See /docs/app/api-reference/directives/use-cache.
const USE_CACHE_FUNCTION_SERIALIZATION_HINT = `Inside \`"use cache"\`, return JSX or serializable data — not a function (including a component reference). See ${USE_CACHE_FUNCTION_DOCS_URL}`

export function annotateUseCacheFunctionSerializationError(
  error: unknown
): void {
  if (!(error instanceof Error) || typeof error.message !== 'string') {
    return
  }

  if (!error.message.includes(REACT_FUNCTION_SERIALIZATION_ERROR)) {
    return
  }

  // Avoid appending the hint more than once if the error is reported again.
  if (error.message.includes(USE_CACHE_FUNCTION_DOCS_URL)) {
    return
  }

  setErrorMessage(
    error,
    error.message.replace(
      REACT_FUNCTION_SERIALIZATION_ERROR,
      `${REACT_FUNCTION_SERIALIZATION_ERROR}\n\n${USE_CACHE_FUNCTION_SERIALIZATION_HINT}`
    )
  )
}
