import { RedirectStatusCode } from './redirect-status-code'

export const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT'

export enum RedirectType {
  push = 'push',
  replace = 'replace',
}

export type RedirectError = Error & {
  digest: `${typeof REDIRECT_ERROR_CODE};${RedirectType};${string};${RedirectStatusCode};`
}

/**
 * Checks if an error is a RedirectError.
 *
 * @param error - The error to check.
 * @returns True if the error is a RedirectError, false otherwise.
 */
export function isRedirectError(error: unknown): error is RedirectError {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('digest' in error) ||
    typeof (error as any).digest !== 'string'
  ) {
    return false
  }

  const digestParts = (error as RedirectError).digest.split(';')
  if (digestParts.length < 4) return false

  const [errorCode, type, , status] = digestParts
  const statusCode = Number(status)

  return (
    errorCode === REDIRECT_ERROR_CODE &&
    (type === RedirectType.replace || type === RedirectType.push) &&
    !isNaN(statusCode) &&
    statusCode in RedirectStatusCode
  )
}

