import NewDevOverlay from '../_new/pages/NewDevOverlay'
import OldDevOverlay from './OldDevOverlay'

type ErrorType = 'runtime' | 'build'

type ReactDevOverlayProps = {
  children?: React.ReactNode
  preventDisplay?: ErrorType[]
  globalOverlay?: boolean
}

export default function ReactDevOverlay(props: ReactDevOverlayProps) {
  const Overlay = !!process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY
    ? NewDevOverlay
    : OldDevOverlay

  return <Overlay {...props} />
}
