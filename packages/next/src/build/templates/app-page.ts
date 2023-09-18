import type { LoaderTree } from '../../server/lib/app-dir-module'

// @ts-ignore this need to be imported from next/dist to be external
import * as module from 'next/dist/server/future/route-modules/app-page/module.compiled'
import { RouteKind } from '../../server/future/route-kind'

const AppPageRouteModule =
  module.AppPageRouteModule as unknown as typeof import('../../server/future/route-modules/app-page/module').AppPageRouteModule

// These are injected by the loader afterwards.
declare const tree: LoaderTree
declare const pages: any

// We inject the tree and pages here so that we can use them in the route
// module.
// INJECT:tree
// INJECT:pages

export { tree, pages }

// @ts-expect-error - replaced by webpack/turbopack loader
export { default as GlobalError } from 'VAR_MODULE_GLOBAL_ERROR'

// These are injected by the loader afterwards.
declare const __next_app_require__: any
declare const __next_app_load_chunk__: any

// INJECT:__next_app_require__
// INJECT:__next_app_load_chunk__

export const originalPathname = 'VAR_ORIGINAL_PATHNAME'
export const __next_app__ = {
  require: __next_app_require__,
  loadChunk: __next_app_load_chunk__,
}

export * from '../../server/app-render/entry-base'

// Create and export the route module that will be consumed.
export const routeModule = new AppPageRouteModule({
  definition: {
    kind: RouteKind.APP_PAGE,
    page: 'VAR_DEFINITION_PAGE',
    pathname: 'VAR_DEFINITION_PATHNAME',
    // The following aren't used in production.
    identity: '',
    bundlePath: '',
    filename: '',
    appPaths: [],
  },
  userland: {
    loaderTree: tree,
  },
})
