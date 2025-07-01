import type { OverlayState } from '../../../../shared'
import type { DebugInfo } from '../../../../../shared/types'
import type { ReadyRuntimeError } from '../../../../utils/get-error-by-type'
import type { HydrationErrorState } from '../../../../../shared/hydration-error'

import { IssuesTabSidebar } from './issues-tab-sidebar'
import { IssuesTabContent } from './issues-tab-content'
import { css } from '../../../../utils/css'
import { useActiveRuntimeError } from '../../../../hooks/use-active-runtime-error'

export function IssuesTab({
  debugInfo,
  runtimeErrors,
  getSquashedHydrationErrorDetails,
  buildError,
}: {
  debugInfo: DebugInfo
  runtimeErrors: ReadyRuntimeError[]
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
  buildError: OverlayState['buildError']
}) {
  const {
    errorCode,
    errorType,
    hydrationWarning,
    activeError,
    activeIdx,
    setActiveIndex,
    notes,
    errorDetails,
  } = useActiveRuntimeError({ runtimeErrors, getSquashedHydrationErrorDetails })

  return (
    <div data-nextjs-devtools-panel-tab-issues>
      {buildError ? null : (
        <IssuesTabSidebar
          runtimeErrors={runtimeErrors}
          errorType={errorType}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
        />
      )}

      <IssuesTabContent
        buildError={buildError}
        notes={notes}
        hydrationWarning={hydrationWarning}
        errorDetails={errorDetails}
        activeError={activeError}
        errorType={errorType}
        debugInfo={debugInfo}
        errorCode={errorCode}
      />
    </div>
  )
}

export const DEVTOOLS_PANEL_TAB_ISSUES_STYLES = css`
  [data-nextjs-devtools-panel-tab-issues] {
    display: flex;
    flex: 1;
    min-height: 0;
  }
`
