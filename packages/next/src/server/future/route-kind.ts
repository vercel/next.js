export const enum RouteKind {
  /**
   * `PAGES` represents all the React pages that are under `pages/`.
   */
  PAGES = 'PAGES',
  /**
   * `PAGES_API` represents all the API routes under `pages/api/`.
   */
  PAGES_API = 'PAGES_API',
  /**
   * `APP_PAGE` represents all the React pages that are under `app/` with the
   * filename of `page.{j,t}s{,x}`.
   */
  APP_PAGE = 'APP_PAGE',
  /**
   * `APP_ROUTE` represents all the API routes and metadata routes that are under `app/` with the
   * filename of `route.{j,t}s{,x}`.
   */
  APP_ROUTE = 'APP_ROUTE',

  /**
   * `INTERNAL_APP` represents all the React pages that are under `app/` that
   * is not directly routable but is used by the framework.
   */
  INTERNAL_APP = 'INTERNAL_APP',

  /**
   * `INTERNAL_PAGES` represents all the React pages that are under `pages/`
   * that is not directly routable but is used by the framework.
   */
  INTERNAL_PAGES = 'INTERNAL_PAGES',

  /**
   * `INTERNAL_ROOT` represents all the files at the root that are not routable
   * but are used by the framework.
   */
  INTERNAL_ROOT = 'INTERNAL_ROOT',
}
