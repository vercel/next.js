import type { OverlayState } from '../../../../shared'

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
  versionInfo: OverlayState['versionInfo']
}

export function ErrorOverlay({
  state,
  runtimeErrors,
  isErrorOverlayOpen,
  setIsErrorOverlayOpen,
}: {
  state: OverlayState
  runtimeErrors: ReadyRuntimeError[]
  isErrorOverlayOpen: boolean
  setIsErrorOverlayOpen: (value: boolean) => void
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
    versionInfo: state.versionInfo,
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
      runtimeErrors={runtimeErrors}
      onClose={() => {
        setIsErrorOverlayOpen(false)
      }}
    />
  )
}
