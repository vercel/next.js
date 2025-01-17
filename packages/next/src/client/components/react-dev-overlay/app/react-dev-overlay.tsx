import OldReactDevOverlay from './old-react-dev-overlay'
import NewReactDevOverlay from '../_experimental/app/react-dev-overlay'

export default Boolean(process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY)
  ? NewReactDevOverlay
  : OldReactDevOverlay
