import {
  AppRouteRouteModule,
  type AppRouteRouteModuleOptions,
} from '../../server/route-modules/app-route/module.compiled'
import { RouteKind } from '../../server/route-kind'
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch'

import * as userland from 'VAR_USERLAND'

// These are injected by the loader afterwards. This is injected as a variable
// instead of a replacement because this could also be `undefined` instead of
// an empty string.
declare const nextConfigOutput: AppRouteRouteModuleOptions['nextConfigOutput']

// We inject the nextConfigOutput here so that we can use them in the route
// module.
// INJECT:nextConfigOutput

const routeModule = new AppRouteRouteModule({
  definition: {
    kind: RouteKind.APP_ROUTE,
    page: 'VAR_DEFINITION_PAGE',
    pathname: 'VAR_DEFINITION_PATHNAME',
    filename: 'VAR_DEFINITION_FILENAME',
    bundlePath: 'VAR_DEFINITION_BUNDLE_PATH',
  },
  resolvedPagePath: 'VAR_RESOLVED_PAGE_PATH',
  nextConfigOutput,
  userland,
})

// Pull out the exports that we need to expose from the module. This should
// be eliminated when we've moved the other routes to the new format. These
// are used to hook into the route.
const { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule

function patchFetch() {
  return _patchFetch({
    workAsyncStorage,
    workUnitAsyncStorage,
  })
}

export {
  routeModule,
  workAsyncStorage,
  workUnitAsyncStorage,
  serverHooks,
  patchFetch,
}
