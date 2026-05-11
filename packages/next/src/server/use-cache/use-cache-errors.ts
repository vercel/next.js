const USE_CACHE_TIMEOUT_ERROR_CODE = 'USE_CACHE_TIMEOUT'
const USE_CACHE_DEADLOCK_ERROR_CODE = 'USE_CACHE_DEADLOCK'
const USE_CACHE_BUILD_HANGS_DOCS =
  'https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout'

export class UseCacheTimeoutError extends Error {
  digest: typeof USE_CACHE_TIMEOUT_ERROR_CODE = USE_CACHE_TIMEOUT_ERROR_CODE

  constructor(route: string) {
    super(
      `Route "${route}": filling a "use cache" entry exceeded \`experimental.useCacheTimeout\` during prerender. This usually means request-scoped data (such as \`params\`, \`searchParams\`, or \`cookies()\`) or an unresolved promise was awaited inside the cached function. Learn more: ${USE_CACHE_BUILD_HANGS_DOCS}`
    )
  }
}

export class UseCacheDeadlockError extends Error {
  digest: typeof USE_CACHE_DEADLOCK_ERROR_CODE = USE_CACHE_DEADLOCK_ERROR_CODE

  constructor(route: string) {
    super(
      `Route "${route}": filling a "use cache" entry is stuck on shared state from the outer render scope. The same function completed in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments within and across requests, so remove the surrounding dedupe layer. Learn more: ${USE_CACHE_BUILD_HANGS_DOCS}`
    )
  }
}

export function isUseCacheTimeoutError(
  err: unknown
): err is UseCacheTimeoutError {
  if (
    typeof err !== 'object' ||
    err === null ||
    !('digest' in err) ||
    typeof err.digest !== 'string'
  ) {
    return false
  }

  return err.digest === USE_CACHE_TIMEOUT_ERROR_CODE
}

export function isUseCacheDeadlockError(
  err: unknown
): err is UseCacheDeadlockError {
  if (
    typeof err !== 'object' ||
    err === null ||
    !('digest' in err) ||
    typeof err.digest !== 'string'
  ) {
    return false
  }

  return err.digest === USE_CACHE_DEADLOCK_ERROR_CODE
}
