/**
 * Augments the digest field of errors thrown in React Server Components (RSC) with an error code.
 * Since RSC errors can only be serialized through the digest field, this provides a way to include
 * an additional error code that can be extracted client-side via `extractNextErrorCode`.
 *
 * The error code is appended to the digest string with a semicolon separator, allowing it to be
 * parsed out later while preserving the original digest value.
 */
export const appendErrorCodeToDigest = (
  thrownValue: unknown,
  originalDigest: string
): string => {
  if (
    typeof thrownValue === 'object' &&
    thrownValue !== null &&
    '__NEXT_ERROR_CODE' in thrownValue
  ) {
    return `${originalDigest};${thrownValue.__NEXT_ERROR_CODE}`
  }
  return originalDigest
}

export const extractNextErrorCode = (error: unknown): string | undefined => {
  if (
    typeof error === 'object' &&
    error !== null &&
    '__NEXT_ERROR_CODE' in error &&
    typeof (error as any).__NEXT_ERROR_CODE === 'string'
  ) {
    return (error as any).__NEXT_ERROR_CODE
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string'
  ) {
    const segments = error.digest.split(';')
    const errorCode = segments.find((segment) => segment.startsWith('E'))
    return errorCode
  }

  return undefined
}

export const removeNextErrorCode = (error: unknown): void => {
  if (
    typeof error === 'object' &&
    error !== null &&
    '__NEXT_ERROR_CODE' in error
  ) {
    delete (error as any).__NEXT_ERROR_CODE
  }
}
