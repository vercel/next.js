import { Params } from '../../shared/lib/router/utils/route-matcher'

export const enum RouteType {
  /**
   * `PAGES` represents all the React pages that are under `pages/`.
   */
  PAGES,
  /**
   * `PAGES_API` represents all the API routes under `pages/api/`.
   */
  PAGES_API,
  /**
   * `APP_PAGE` represents all the React pages that are under `app/` with the
   * filename of `page.{j,t}s{,x}`.
   */
  APP_PAGE,
  /**
   * `APP_ROUTE` represents all the API routes that are under `app/` with the
   * filename of `route.{j,t}s{,x}`.
   */
  APP_ROUTE,
}

/**
 * RouteMatch is the resolved match for a given request. This will contain all
 * the dynamic parameters used for this route.
 */
export interface RouteMatch<R extends RouteType> {
  readonly type: R
  readonly filename: string
  readonly params?: Params
}
