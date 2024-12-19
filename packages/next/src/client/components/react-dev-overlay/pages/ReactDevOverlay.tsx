import OldReactDevOverlay from './OldReactDevOverlay'
import NewReactDevOverlay from '../_experimental/pages/ReactDevOverlay'

export default Boolean(process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY)
  ? NewReactDevOverlay
  : OldReactDevOverlay
