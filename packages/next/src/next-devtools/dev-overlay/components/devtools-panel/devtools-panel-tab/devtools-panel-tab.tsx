import type { DevToolsPanelTabType } from '../devtools-panel'
import type { OverlayDispatch, OverlayState } from '../../../shared'

import { SettingsTab } from './settings-tab'

export function DevToolsPanelTab({
  activeTab,
  state,
  dispatch,
}: {
  activeTab: DevToolsPanelTabType
  state: OverlayState
  dispatch: OverlayDispatch
}) {
  if (activeTab === 'settings') {
    return <SettingsTab state={state} dispatch={dispatch} />
  }

  if (activeTab === 'route') {
    return <div>Route</div>
  }

  if (activeTab === 'issues') {
    return <div>Issues</div>
  }

  console.log(
    `[Next.js DevTools] Received unknown Panel Tab: "${activeTab}". This is a bug in Next.js DevTools.`
  )
  return null
}
