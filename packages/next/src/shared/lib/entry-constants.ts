import { createPage } from './route-types'

export const UNDERSCORE_NOT_FOUND_ROUTE = '/_not-found'
export const UNDERSCORE_NOT_FOUND_ROUTE_ENTRY = createPage(
  `${UNDERSCORE_NOT_FOUND_ROUTE}/page`
)
export const UNDERSCORE_GLOBAL_ERROR_ROUTE = '/_global-error'
export const UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY = createPage(
  `${UNDERSCORE_GLOBAL_ERROR_ROUTE}/page`
)
