import { EdgeRouteModuleWrapper } from 'next/dist/server/web/edge-route-module-wrapper'

import { AppRouteRouteModule } from 'next/dist/server/future/route-modules/app-route/module'
import { RouteKind } from 'next/dist/server/future/route-kind'
import * as userland from 'ENTRY'
import { PAGE, PATHNAME } from 'BOOTSTRAP_CONFIG'

// TODO: (wyattjoh) - perform the option construction in Rust to allow other modules to accept different options
const routeModule = new AppRouteRouteModule({
  userland,
  definition: {
    kind: RouteKind.APP_ROUTE,
    page: PAGE,
    pathname: PATHNAME,
    // The following aren't used in production.
    identity: '',
    filename: '',
    bundlePath: '',
  },
  resolvedPagePath: `app/${PAGE}`,
  nextConfigOutput: undefined,
})

// @ts-expect-error - exposed for edge support
globalThis._ENTRIES = {
  middleware_edge: {
    default: EdgeRouteModuleWrapper.wrap(routeModule, {
      page: `/${PAGE}`,
    }),
  },
}
