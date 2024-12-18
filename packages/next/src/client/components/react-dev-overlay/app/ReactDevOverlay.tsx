import OldReactDevOverlay from './OldReactDevOverlay'
import NewReactDevOverlay from '../_experimental/app/ReactDevOverlay'

export default Boolean(process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY)
  ? NewReactDevOverlay
  : OldReactDevOverlay
