import {
  ACTION_ERROR_OVERLAY_CLOSE,
  type OverlayDispatch,
  type OverlayState,
} from '../../../shared'

import { Suspense } from 'react'
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

  // No Runtime Errors.
  if (!runtimeErrors.length) {
    // Workaround React quirk that triggers "Switch to client-side rendering" if
    // we return no Suspense boundary here.
    return <Suspense />
  }

  if (!mounted) {
    // Workaround React quirk that triggers "Switch to client-side rendering" if
    // we return no Suspense boundary here.
    return <Suspense />
  }

  return (
    <Errors
      {...commonProps}
      debugInfo={state.debugInfo}
      getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetails}
      runtimeErrors={runtimeErrors}
      onClose={() => {
        dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
      }}
    />
  )
}
