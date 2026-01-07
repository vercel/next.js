import '../server/require-hook'
// Import cpu-profile to start profiling early if enabled
import '../server/lib/cpu-profile'

export {
  getDefinedNamedExports,
  hasCustomGetInitialProps,
  isPageStatic,
} from './utils'
export { exportPages } from '../export/worker'
