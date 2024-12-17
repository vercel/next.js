import OldReactDevOverlay from './OldReactDevOverlay'
export type ErrorType = 'runtime' | 'build'
type ReactDevOverlayProps = {
  children?: React.ReactNode
  preventDisplay?: ErrorType[]
  globalOverlay?: boolean
}

export default function ReactDevOverlay(props: ReactDevOverlayProps) {
  return <OldReactDevOverlay {...props} />
}
