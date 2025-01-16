import OldReactDevOverlay from './old-react-dev-overlay'
import NewReactDevOverlay from '../_experimental/pages/react-dev-overlay'

const ReactDevOverlay = Boolean(process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY)
  ? NewReactDevOverlay
  : OldReactDevOverlay

export type ReactDevOverlayType = typeof ReactDevOverlay

export default ReactDevOverlay
