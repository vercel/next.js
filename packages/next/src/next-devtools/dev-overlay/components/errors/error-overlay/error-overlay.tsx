import {
  ACTION_ERROR_OVERLAY_CLOSE,
  ACTION_ERROR_OVERLAY_OPEN,
  type OverlayDispatch,
  type OverlayState,
} from '../../../shared'

import { Activity } from 'react'
import { BuildError } from '../../../container/build-error'
import { Errors } from '../../../container/errors'
import { useDelayedRender } from '../../../hooks/use-delayed-render'
import type { ReadyRuntimeError } from '../../../utils/get-error-by-type'
import type { HydrationErrorState } from '../../../../shared/hydration-error'

const transitionDurationMs = 200

export interface ErrorBaseProps {
  rendered: boolean
  transitionDurationMs: number
  isTurbopack: boolean
  versionInfo: OverlayState['versionInfo']
  errorCount: number
}

export function ErrorOverlay({
  state,
  dispatch,
  getSquashedHydrationErrorDetails,
  runtimeErrors,
  errorCount,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
  runtimeErrors: ReadyRuntimeError[]
  errorCount: number
}) {
  const isTurbopack = !!process.env.TURBOPACK

  // This hook lets us do an exit animation before unmounting the component
  const { mounted, rendered } = useDelayedRender(state.isErrorOverlayOpen, {
    enterDelay: 0,
    exitDelay: transitionDurationMs,
  })

  const commonProps = {
    rendered,
    transitionDurationMs,
    isTurbopack,
    versionInfo: state.versionInfo,
    errorCount,
  }

  if (state.buildError !== null) {
    return (
      <BuildError
        {...commonProps}
        message={state.buildError}
        // This is not a runtime error, forcedly display error overlay
        rendered
      />
    )
  }

  // No runtime errors or upgrade insight to display.
  if (!runtimeErrors.length && !state.hasVulnerabilityInsight) {
    return null
  }

  return (
    <Activity mode={mounted ? 'visible' : 'hidden'}>
      <Errors
        activeTab={state.errorOverlayTab}
        onTabChange={(tab) => {
          dispatch({ type: ACTION_ERROR_OVERLAY_OPEN, tab })
        }}
        {...commonProps}
        debugInfo={state.debugInfo}
        getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetails}
        runtimeErrors={runtimeErrors}
        hasVulnerabilityInsight={state.hasVulnerabilityInsight}
        onClose={() => {
          dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
        }}
      />
    </Activity>
  )
}
