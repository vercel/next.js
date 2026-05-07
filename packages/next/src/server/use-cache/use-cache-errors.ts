const USE_CACHE_TIMEOUT_ERROR_CODE = 'USE_CACHE_TIMEOUT'
const USE_CACHE_DEADLOCK_ERROR_CODE = 'USE_CACHE_DEADLOCK'

export class UseCacheTimeoutError extends Error {
  digest: typeof USE_CACHE_TIMEOUT_ERROR_CODE = USE_CACHE_TIMEOUT_ERROR_CODE

  constructor() {
    super(
      `Filling a "use cache" entry exceeded \`experimental.useCacheTimeout\` during prerender. This usually means a request-scoped value (e.g. \`params\`, \`searchParams\`, \`cookies()\`) or an unresolved promise was awaited inside the cached function. Learn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
    )
  }
}

export class UseCacheDeadlockError extends Error {
  digest: typeof USE_CACHE_DEADLOCK_ERROR_CODE = USE_CACHE_DEADLOCK_ERROR_CODE

  constructor() {
    super(
      'Filling a "use cache" entry appears to be stuck on shared state from the outer render scope. The same function completed when run in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments — within a request and across requests on the same server instance — so the surrounding dedupe layer is both unnecessary and the likely cause. Remove it and rely on "use cache" alone for deduping.'
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
