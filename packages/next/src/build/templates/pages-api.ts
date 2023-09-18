// @ts-ignore this need to be imported from next/dist to be external
import * as module from 'next/dist/server/future/route-modules/pages-api/module.compiled'

import { RouteKind } from '../../server/future/route-kind'
import { hoist } from './helpers'

const PagesAPIRouteModule =
  module.PagesAPIRouteModule as unknown as typeof import('../../server/future/route-modules/pages-api/module').PagesAPIRouteModule

// Import the userland code.
// @ts-expect-error - replaced by webpack/turbopack loader
import * as userland from 'VAR_USERLAND'

// Re-export the handler (should be the default export).
export default hoist(userland, 'default')

// Re-export config.
export const config = hoist(userland, 'config')

// Create and export the route module that will be consumed.
export const routeModule = new PagesAPIRouteModule({
  definition: {
    kind: RouteKind.PAGES_API,
    page: 'VAR_DEFINITION_PAGE',
    pathname: 'VAR_DEFINITION_PATHNAME',
    // The following aren't used in production.
    identity: '',
    bundlePath: '',
    filename: '',
  },
  userland,
})
