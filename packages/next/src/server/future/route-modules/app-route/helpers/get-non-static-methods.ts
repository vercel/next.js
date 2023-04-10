import type { HTTP_METHOD } from '../../../../web/http'
import type { AppRouteHandlers } from '../module'

const NON_STATIC_METHODS = [
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
] as const

/**
 * Gets all the method names for handlers that are not considered static.
 *
 * @param handlers the handlers from the userland module
 * @returns the method names that are not considered static or false if all
 *          methods are static
 */
export function getNonStaticMethods(
  handlers: AppRouteHandlers
): ReadonlyArray<HTTP_METHOD> | false {
  // We can currently only statically optimize if only GET/HEAD are used as
  // prerender can't be used conditionally based on the method currently.
  const methods = NON_STATIC_METHODS.filter((method) => handlers[method])
  if (methods.length === 0) return false

  return methods
}
