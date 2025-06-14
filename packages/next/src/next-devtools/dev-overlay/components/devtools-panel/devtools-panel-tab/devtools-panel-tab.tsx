import type { DevToolsPanelTabType } from '../devtools-panel'
import type { OverlayDispatch, OverlayState } from '../../../shared'
import type { ReadyRuntimeError } from '../../../utils/get-error-by-type'
import type { HydrationErrorState } from '../../../../shared/hydration-error'

import { SettingsTab } from './settings-tab'
import { IssuesTab } from './issues-tab/issues-tab'

export function DevToolsPanelTab({
  activeTab,
  state,
  dispatch,
  runtimeErrors,
  getSquashedHydrationErrorDetails,
}: {
  activeTab: DevToolsPanelTabType
  state: OverlayState
  dispatch: OverlayDispatch
  runtimeErrors: ReadyRuntimeError[]
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
}) {
  if (activeTab === 'settings') {
    return <SettingsTab state={state} dispatch={dispatch} />
  }

  if (activeTab === 'route') {
    return <div>Route</div>
  }

  if (activeTab === 'issues') {
    return (
      <IssuesTab
        state={state}
        runtimeErrors={runtimeErrors}
        getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetails}
      />
    )
  }

  console.log(
    `[Next.js DevTools] Received unknown Panel Tab: "${activeTab}". This is a bug in Next.js DevTools.`
  )
  return null
}
