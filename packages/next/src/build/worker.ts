import '../server/require-hook'
// Import cpu-profile to start profiling early if enabled
import '../server/lib/cpu-profile'

import { installBindings } from './swc/install-bindings'
import { installCodeFrameSupport } from '../server/lib/install-code-frame'
import { isPageStatic as isPageStaticImpl } from './utils'

// Set the global asset suffix for Turbopack compiled code to use during prerendering
;(globalThis as any).NEXT_CLIENT_ASSET_SUFFIX =
  process.env.__NEXT_PRERENDER_CLIENT_ASSET_SUFFIX

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
