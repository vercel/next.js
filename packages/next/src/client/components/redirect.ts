import { actionAsyncStorage } from '../../server/app-render/action-async-storage.external'
import { RedirectStatusCode } from './redirect-status-code'
import {
  RedirectType,
  type RedirectError,
  isRedirectError,
  REDIRECT_ERROR_CODE,
} from './redirect-error'

/**
 * Utility to extract fields from the RedirectError digest.
 * @param error - The RedirectError object
 * @param index - The index of the field in the digest
 */
function getDigestField(error: RedirectError, index: number): string {
  if (!isRedirectError(error)) {
    throw new Error('Provided error is not a RedirectError.')
  }
  const digestParts = error.digest.split(';')
  if (index < 0 || index >= digestParts.length) {
    throw new Error('Invalid digest index.')
  }
  return digestParts[index]
}

/**
 * Generates a RedirectError object with the specified parameters.
 * @param url - The URL to redirect to
 * @param type - The type of redirect (push or replace)
 * @param statusCode - The HTTP status code for the redirect
 */
export function getRedirectError(
  url: string,
  type: RedirectType,
  statusCode: RedirectStatusCode = RedirectStatusCode.TemporaryRedirect
): RedirectError {
  const error = new Error(REDIRECT_ERROR_CODE) as RedirectError
  error.digest = `${REDIRECT_ERROR_CODE};${type};${url};${statusCode};`
  return error
}

/**
 * Performs a temporary redirect.
 * This function works in Server Components, Route Handlers, and Server Actions.
 * @param url - The URL to redirect to
 * @param type - The type of redirect (push or replace). Defaults to context-based.
 */
export function redirect(
  url: string,
  type?: RedirectType
): never {
  const actionStore = actionAsyncStorage.getStore()
  const redirectType =
    type || (actionStore?.isAction ? RedirectType.push : RedirectType.replace)
  throw getRedirectError(
    url,
    redirectType,
    RedirectStatusCode.TemporaryRedirect
  )
}

/**
 * Performs a permanent redirect.
 * This function works in Server Components, Route Handlers, and Server Actions.
 * @param url - The URL to redirect to
 * @param type - The type of redirect (push or replace). Defaults to 'replace'.
 */
export function permanentRedirect(
  url: string,
  type: RedirectType = RedirectType.replace
): never {
  throw getRedirectError(url, type, RedirectStatusCode.PermanentRedirect)
}

/**
 * Extracts the encoded URL from a RedirectError.
 * @param error - The error object to parse
 * @returns The redirect URL or null if the error is not a RedirectError.
 */
export function getURLFromRedirectError(error: unknown): string | null {
  if (!isRedirectError(error)) return null
  return getDigestField(error as RedirectError, 2) // URL is the third field
}

/**
 * Extracts the redirect type (push or replace) from a RedirectError.
 * @param error - The RedirectError object
 * @returns The redirect type (push or replace)
 */
export function getRedirectTypeFromError(error: RedirectError): RedirectType {
  return getDigestField(error, 1) as RedirectType
}

/**
 * Extracts the status code from a RedirectError.
 * @param error - The RedirectError object
 * @returns The HTTP status code as a number
 */
export function getRedirectStatusCodeFromError(error: RedirectError): number {
  const statusCode = getDigestField(error, -2) // Status code is the second-to-last field
  return Number(statusCode)
}

