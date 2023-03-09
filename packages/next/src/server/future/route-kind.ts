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
}
