import { PagesDevOverlayErrorBoundary } from './pages-dev-overlay-error-boundary'
import { usePagesDevOverlayBridge } from './hooks'

export type ErrorType = 'runtime' | 'build'

export type PagesDevOverlayBridgeType = typeof PagesDevOverlayBridge

interface PagesDevOverlayBridgeProps {
  children?: React.ReactNode
}

export function PagesDevOverlayBridge({
  children,
}: PagesDevOverlayBridgeProps) {
  usePagesDevOverlayBridge()

  return <PagesDevOverlayErrorBoundary>{children}</PagesDevOverlayErrorBoundary>
}
