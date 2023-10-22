import type { LoaderTree } from '../../server/lib/app-dir-module'
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
;('TURBOPACK { transition: next-ssr }')
import { AppPageRouteModule } from '../../server/future/route-modules/app-page/module.compiled'
import { RouteKind } from '../../server/future/route-kind'

// These are injected by the loader afterwards.

/**
 * The tree created in next-app-loader that holds component segments and modules
 * and I've updated it.
 */
declare const tree: LoaderTree
declare const pages: any

// We inject the tree and pages here so that we can use them in the route
// module.
// INJECT:tree
// INJECT:pages

export { tree, pages }

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
    bundlePath: '',
    filename: '',
    appPaths: [],
  },
  userland: {
    loaderTree: tree,
  },
})
