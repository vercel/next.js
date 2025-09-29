import { createPortal } from 'react-dom'
import { useDevOverlayContext } from '../../dev-overlay.browser'

export function ShadowPortal({ children }: { children: React.ReactNode }) {
  const { shadowRoot } = useDevOverlayContext()

  return createPortal(children, shadowRoot)
}
