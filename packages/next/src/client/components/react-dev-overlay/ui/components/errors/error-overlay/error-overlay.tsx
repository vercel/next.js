import type { DevToolsClientState, OverlayState } from '../../../../shared'

import { Suspense } from 'react'
import { BuildError } from '../../../container/build-error'
import { Errors } from '../../../container/errors'
import { useDelayedRender } from '../../../hooks/use-delayed-render'
import type { ReadyRuntimeError } from '../../../../utils/get-error-by-type'

const transitionDurationMs = 200

export interface ErrorBaseProps {
  rendered: boolean
  transitionDurationMs: number
  isTurbopack: boolean
  versionInfo: DevToolsClientState['versionInfo']
  errorCount: number
}

export function ErrorOverlay({
  state,
  runtimeErrors,
  isErrorOverlayOpen,
  setIsErrorOverlayOpen,
  errorCount,
}: {
  state: OverlayState
  runtimeErrors: ReadyRuntimeError[]
  isErrorOverlayOpen: boolean
  setIsErrorOverlayOpen: (value: boolean) => void
  errorCount: number
}) {
  const isTurbopack = !!process.env.TURBOPACK

  // This hook lets us do an exit animation before unmounting the component
  const { mounted, rendered } = useDelayedRender(isErrorOverlayOpen, {
    exitDelay: transitionDurationMs,
  })

  const commonProps = {
    rendered,
    transitionDurationMs,
    isTurbopack,
    versionInfo: state.devToolsClientState.versionInfo,
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
      debugInfo={state.devToolsClientState.debugInfo}
      runtimeErrors={runtimeErrors}
      onClose={() => {
        setIsErrorOverlayOpen(false)
      }}
    />
  )
}
