import '../server/require-hook'
// Import cpu-profile to start profiling early if enabled
import '../server/lib/cpu-profile'

import { installBindings } from './swc/install-bindings'
import { installCodeFrameSupport } from '../server/lib/install-code-frame'
import { isPageStatic as isPageStaticImpl } from './utils'
import { enableLazySourceMaps } from '../server/lib/source-maps'

// Set the global asset suffix for Turbopack compiled code to use during prerendering
;(globalThis as any).NEXT_CLIENT_ASSET_SUFFIX =
  process.env.__NEXT_PRERENDER_CLIENT_ASSET_SUFFIX

// `enablePrerenderSourceMaps`: source-map errors logged while collecting page
// data and prerendering. The source maps are read when an error is first
// formatted, rather than by Node.js for every loaded module via
// `--enable-source-maps`, which slows down prerendering many pages.
if (process.env.__NEXT_PRERENDER_SOURCE_MAPS === '1') {
  enableLazySourceMaps()
}

export { getDefinedNamedExports, hasCustomGetInitialProps } from './utils'

// Install native bindings and code-frame support before collecting page data so
// errors thrown there (e.g. an empty `generateStaticParams`) render a code
// frame in the build output, matching prerender errors. Both are idempotent.
// This is done in the worker entry rather than in `./utils`, which is reachable
// from `next-server` and would otherwise pull the devtools code-frame renderer
// into the production server's file trace.
export const isPageStatic: typeof isPageStaticImpl = async (params) => {
  await installBindings()
  installCodeFrameSupport()
  return isPageStaticImpl(params)
}

export { exportPages } from '../export/worker'
