import '../../server/node-polyfill-headers'

// @ts-ignore this need to be imported from next/dist to be external
import * as module from 'next/dist/server/future/route-modules/app-route/module.compiled'

import type { AppRouteRouteModuleOptions } from '../../server/future/route-modules/app-route/module'
import { RouteKind } from '../../server/future/route-kind'

// @ts-expect-error - replaced by webpack/turbopack loader
import * as userland from 'VAR_USERLAND'

const AppRouteRouteModule =
  module.AppRouteRouteModule as unknown as typeof import('../../server/future/route-modules/app-route/module').AppRouteRouteModule

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
    identity: '',
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
const {
  requestAsyncStorage,
  staticGenerationAsyncStorage,
  serverHooks,
  headerHooks,
  staticGenerationBailout,
} = routeModule

const originalPathname = 'VAR_ORIGINAL_PATHNAME'

export {
  routeModule,
  requestAsyncStorage,
  staticGenerationAsyncStorage,
  serverHooks,
  headerHooks,
  staticGenerationBailout,
  originalPathname,
}
