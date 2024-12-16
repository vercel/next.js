import type { Dispatcher } from './hot-reloader-client'
import type { OverlayState } from '../shared'
import OldDevOverlay from './OldDevOverlay'
import NewDevOverlay from '../_new/app/NewDevOverlay'

type ReactDevOverlayProps = {
  state: OverlayState
  dispatcher?: Dispatcher
  children: React.ReactNode
}

export default function ReactDevOverlay(props: ReactDevOverlayProps) {
  const Overlay = !!process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY
    ? NewDevOverlay
    : OldDevOverlay

  return <Overlay {...props} />
}
