import type { LoaderTree } from '../../server/lib/app-dir-module'

import { AppPageRouteModule } from '../../server/route-modules/app-page/module.compiled' with { 'turbopack-transition': 'next-ssr' }

import { RouteKind } from '../../server/route-kind' with { 'turbopack-transition': 'next-server-utility' }

import * as entryBase from '../../server/app-render/entry-base' with { 'turbopack-transition': 'next-server-utility' }

// interopDefault is used as a free variable in the INJECT:tree generated code
// (see crates/next-core/src/app_page_loader_tree.rs), so it must remain in
// this template's compiled output as a local binding named `interopDefault`.
// verbatimModuleSyntax ensures the import is preserved as-is.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { interopDefault } from '../../server/app-render/interop-default' with { 'turbopack-transition': 'next-server-utility' }

import { createHandler } from '../../server/app-render/app-page' with { 'turbopack-transition': 'next-server-utility' }

export * from '../../server/app-render/entry-base' with { 'turbopack-transition': 'next-server-utility' }

// These are injected by the loader afterwards.
declare const tree: LoaderTree
declare const __next_app_require__: (id: string | number) => unknown
declare const __next_app_load_chunk__: (id: string | number) => Promise<unknown>
// INJECT:tree
// INJECT:__next_app_require__
// INJECT:__next_app_load_chunk__

export const __next_app__ = {
  require: __next_app_require__,
  loadChunk: __next_app_load_chunk__,
}

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
  distDir: process.env.__NEXT_RELATIVE_DIST_DIR || '',
  relativeProjectDir: process.env.__NEXT_RELATIVE_PROJECT_DIR || '',
})

export const handler = createHandler(routeModule, entryBase, tree, __next_app__)
