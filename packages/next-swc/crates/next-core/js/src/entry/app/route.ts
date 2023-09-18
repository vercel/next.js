// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '../../internal/nodejs-proxy-handler'

import AppRouteRouteModule from 'next/dist/server/future/route-modules/app-route/module'
import { RouteKind } from 'next/dist/server/future/route-kind'
import * as userland from 'ENTRY'
import { PAGE, PATHNAME } from 'BOOTSTRAP_CONFIG'

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

startHandler(routeModule)
