const ERROR_CODE_DELIMITER = '@'

/**
 * Augments the digest field of errors thrown in React Server Components (RSC) with an error code.
 * Since RSC errors can only be serialized through the digest field, this provides a way to include
 * an additional error code that can be extracted client-side via `extractNextErrorCode`.
 *
 * The error code is appended to the digest string with a semicolon separator, allowing it to be
 * parsed out later while preserving the original digest value.
 */
export const createDigestWithErrorCode = (
  thrownValue: unknown,
  originalDigest: string
): string => {
  if (
    typeof thrownValue === 'object' &&
    thrownValue !== null &&
    '__NEXT_ERROR_CODE' in thrownValue
  ) {
    return `${originalDigest}${ERROR_CODE_DELIMITER}${thrownValue.__NEXT_ERROR_CODE}`
  }
  return originalDigest
}

/**
 * Copies the error code from one error to another by setting the __NEXT_ERROR_CODE property.
 * This allows error codes to be preserved when wrapping or transforming errors.
 */
export const copyNextErrorCode = (source: unknown, target: unknown): void => {
  const errorCode = extractNextErrorCode(source)
  if (errorCode && typeof target === 'object' && target !== null) {
    Object.defineProperty(target, '__NEXT_ERROR_CODE', {
      value: errorCode,
      enumerable: false,
      configurable: true,
    })
  }
}

export const extractNextErrorCode = (error: unknown): string | undefined => {
  if (
    typeof error === 'object' &&
    error !== null &&
    '__NEXT_ERROR_CODE' in error &&
    typeof error.__NEXT_ERROR_CODE === 'string'
  ) {
    return error.__NEXT_ERROR_CODE
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string'
  ) {
    const segments = error.digest.split(ERROR_CODE_DELIMITER)
    const errorCode = segments.find((segment) => segment.startsWith('E'))
    return errorCode
  }

  return undefined
}
