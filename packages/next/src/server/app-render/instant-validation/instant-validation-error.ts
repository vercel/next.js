const INSTANT_VALIDATION_ERROR_DIGEST = 'INSTANT_VALIDATION_ERROR'

/** Check if an error is an exhaustive samples validation error (by digest). */
export function isInstantValidationError(err: unknown): boolean {
  return !!(
    err &&
    typeof err === 'object' &&
    err instanceof Error &&
    (err as any).digest === INSTANT_VALIDATION_ERROR_DIGEST
  )
}

export class InstantValidationError extends Error {
  digest = INSTANT_VALIDATION_ERROR_DIGEST
}
