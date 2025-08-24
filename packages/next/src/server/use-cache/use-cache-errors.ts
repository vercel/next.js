const USE_CACHE_TIMEOUT_ERROR_CODE = 'USE_CACHE_TIMEOUT'

export class UseCacheTimeoutError extends Error {
  digest: typeof USE_CACHE_TIMEOUT_ERROR_CODE = USE_CACHE_TIMEOUT_ERROR_CODE

  constructor() {
    super(
      'Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".'
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
