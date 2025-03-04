import {
  HMR_ACTIONS_SENT_TO_BROWSER,
  type HMR_ACTION_TYPES,
} from '../../../../server/dev/hot-reloader-types'
import { devBuildIndicator } from './dev-build-indicator'

/**
 * Handles HMR events to control the dev build indicator visibility.
 * Shows indicator when building and hides it when build completes or syncs.
 */
export const handleDevBuildIndicatorHmrEvents = (obj: HMR_ACTION_TYPES) => {
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
}
