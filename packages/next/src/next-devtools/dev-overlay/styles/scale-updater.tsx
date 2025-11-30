import { useLayoutEffect } from 'react'
import { useDevOverlayContext } from '../../dev-overlay.browser'

export function ScaleUpdater() {
  const { shadowRoot, state } = useDevOverlayContext()

  useLayoutEffect(() => {
    // Update the CSS custom property for scale
    if (shadowRoot?.host) {
      ;(shadowRoot.host as HTMLElement).style.setProperty(
        '--nextjs-dev-tools-scale',
        String(state.scale || 1)
      )
    }
  }, [shadowRoot, state.scale])

  return null
}
