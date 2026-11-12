/**
 * List of valid HTTP methods that can be implemented by Next.js's Custom App
 * Routes.
 */
export const HTTP_METHODS = [
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
] as const

/**
 * A type representing the valid HTTP methods that can be implemented by
 * Next.js's Custom App Routes.
 */
export type HTTP_METHOD = (typeof HTTP_METHODS)[number]

/**
 * Checks to see if the passed string is an HTTP method. Note that this is case
 * sensitive.
 *
 * @param maybeMethod the string that may be an HTTP method
 * @returns true if the string is an HTTP method
 */
export function isHTTPMethod(maybeMethod: string): maybeMethod is HTTP_METHOD {
  return HTTP_METHODS.includes(maybeMethod as HTTP_METHOD)
}

/**
 * Checks to see if the passed status is a null body status, i.e. a response
 * with this status cannot be constructed with a body (not even an empty one).
 * 101 and 103 are excluded because the Response constructor doesn't accept
 * them at all.
 *
 * @see https://fetch.spec.whatwg.org/#null-body-status
 */
export function isNullBodyStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304
}
