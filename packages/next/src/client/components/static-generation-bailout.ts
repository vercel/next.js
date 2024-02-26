const NEXT_STATIC_GEN_BAILOUT = 'NEXT_STATIC_GEN_BAILOUT'

export class StaticGenBailoutError extends Error {
  public readonly code = NEXT_STATIC_GEN_BAILOUT
}

export function isStaticGenBailoutError(
  error: unknown
): error is StaticGenBailoutError {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }

  return error.code === NEXT_STATIC_GEN_BAILOUT
}
