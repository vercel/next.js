import '../server/require-hook'
// Import cpu-profile to start profiling early if enabled
import '../server/lib/cpu-profile'

// Set the global asset suffix for Turbopack compiled code to use during prerendering
;(globalThis as any).NEXT_CLIENT_ASSET_SUFFIX =
  process.env.__NEXT_PRERENDER_CLIENT_ASSET_SUFFIX

export {
  getDefinedNamedExports,
  hasCustomGetInitialProps,
  isPageStatic,
} from './utils'
export { exportPages } from '../export/worker'
