import OldReactDevOverlay from './OldReactDevOverlay'
import NewReactDevOverlay from '../_experimental/pages/ReactDevOverlay'

const ReactDevOverlay = Boolean(process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY)
  ? NewReactDevOverlay
  : OldReactDevOverlay

export type ReactDevOverlayType = typeof ReactDevOverlay

export default ReactDevOverlay
