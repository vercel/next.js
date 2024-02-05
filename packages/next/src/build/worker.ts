import '../server/require-hook'

export {
  getDefinedNamedExports,
  hasCustomGetInitialProps,
  isPageStatic,
} from './utils'
import exportPage from '../export/worker'
export { exportPage }
