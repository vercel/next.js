import type { Route } from '../../shared/lib/route-types'

/**
 * This transforms a URL pathname into a route. It removes any trailing slashes
 * and the `/index` suffix.
 *
 * @param pathname - The URL path that needs to be optimized.
 * @returns - The route
 *
 * @example
 * // returns '/example'
 * toRoute('/example/index/');
 *
 * @example
 * // returns '/example'
 * toRoute('/example/');
 *
 * @example
 * // returns '/'
 * toRoute('/index/');
 *
 * @example
 * // returns '/'
 * toRoute('/');
 */
export function toRoute(pathname: Route): Route {
  return (pathname.replace(/(?:\/index)?\/?$/, '') || '/') as Route
}
