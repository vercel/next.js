import { addMessageListener } from '../../components/react-dev-overlay/pages/websocket'
import { devBuildIndicator } from './internal/dev-build-indicator'
import { handleDevBuildIndicatorHmrEvents } from './internal/handle-dev-build-indicator-hmr-events'

/** Integrates the generic dev build indicator with the Pages Router. */
export const initializeDevBuildIndicatorForPageRouter = () => {
  if (!process.env.__NEXT_BUILD_INDICATOR) {
    return
  }

  devBuildIndicator.initialize(process.env.__NEXT_BUILD_INDICATOR_POSITION)

  // Add message listener specifically for Pages Router to handle lifecycle events
  // related to dev builds (building, built, sync)
  addMessageListener(handleDevBuildIndicatorHmrEvents)
}
