import { browser } from 'react-dom'
import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { createReactBrowserBailoutReason } from '../../shared/lib/lazy-dynamic/react-browser-bailout'

const RENDER_IN_BROWSER_BAILOUT_REASON = 'Render in Browser'
const getRenderInBrowserBailoutReason = createReactBrowserBailoutReason.bind(
  null,
  RENDER_IN_BROWSER_BAILOUT_REASON
)

/**
 * Aborting a resumed render with a recoverable reason tells React to leave the
 * postponed boundary for the browser instead of reporting a render error.
 */
export function createRenderInBrowserAbortSignal(
  reactBrowserBailout: boolean
): AbortSignal {
  const controller = new AbortController()
  if (reactBrowserBailout) {
    // @ts-expect-error TODO: Update @types/react-dom to include the reason argument.
    controller.abort(browser(getRenderInBrowserBailoutReason))
  } else {
    controller.abort(new BailoutToCSRError(RENDER_IN_BROWSER_BAILOUT_REASON))
  }
  return controller.signal
}
