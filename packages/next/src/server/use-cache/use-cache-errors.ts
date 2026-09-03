import { setErrorMessage } from '../../lib/format-server-error'

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
