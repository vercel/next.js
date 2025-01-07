import { HMR_ACTIONS_SENT_TO_BROWSER } from '../../../server/dev/hot-reloader-types'
import { addMessageListener } from '../../components/react-dev-overlay/pages/websocket'
import { devBuildIndicator } from './internal/dev-build-indicator'

/** Integrates the generic dev build indicator with the Pages Router. */
export const initializeDevBuildIndicatorForPageRouter = () => {
  if (!process.env.__NEXT_BUILD_INDICATOR) {
    return
  }

  devBuildIndicator.initialize(process.env.__NEXT_BUILD_INDICATOR_POSITION)

  // Add message listener specifically for Pages Router to handle lifecycle events
  // related to dev builds (building, built, sync)
  addMessageListener((obj) => {
    try {
      if (!('action' in obj)) {
        return
      }

      // eslint-disable-next-line default-case
      switch (obj.action) {
        case HMR_ACTIONS_SENT_TO_BROWSER.BUILDING:
          devBuildIndicator.show()
          break
        case HMR_ACTIONS_SENT_TO_BROWSER.BUILT:
        case HMR_ACTIONS_SENT_TO_BROWSER.SYNC:
          devBuildIndicator.hide()
          break
      }
    } catch {}
  })
}
