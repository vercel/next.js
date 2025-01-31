import type { OverlayState } from '../../../../../shared'
import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'

import { BuildError } from '../../../container/build-error'
import { Errors } from '../../../container/errors'
import { RootLayoutMissingTagsError } from '../../../container/root-layout-missing-tags-error'
import { useDelayedRender } from '../../../hooks/use-delayed-render'
import { createContext, useContext } from 'react'

const transitionDurationMs = 200

interface C {
  rendered: boolean
  transitionDurationMs: number
}

const ErrorContext = createContext({} as C)

export function useErrorContext() {
  const context = useContext(ErrorContext)

  // For Storybook we just render the overlay
  if (!context.rendered && !context.transitionDurationMs) {
    return {
      rendered: true,
      transitionDurationMs,
    }
  }

  return context
}

export function ErrorOverlay({
  state,
  readyErrors,
  isErrorOverlayOpen,
  setIsErrorOverlayOpen,
}: {
  state: OverlayState
  readyErrors: ReadyRuntimeError[]
  isErrorOverlayOpen: boolean
  setIsErrorOverlayOpen: (value: boolean) => void
}) {
  const isTurbopack = !!process.env.TURBOPACK

  // This hook lets us do an exit animation before unmounting the component
  const { mounted, rendered } = useDelayedRender(isErrorOverlayOpen, {
    exitDelay: transitionDurationMs,
  })

  if (!!state.rootLayoutMissingTags?.length) {
    return (
      <RootLayoutMissingTagsError
        isTurbopack={isTurbopack}
        missingTags={state.rootLayoutMissingTags}
        versionInfo={state.versionInfo}
      />
    )
  }

  if (state.buildError !== null) {
    return (
      <BuildError
        isTurbopack={isTurbopack}
        message={state.buildError}
        versionInfo={state.versionInfo}
      />
    )
  }

  // No Runtime Errors.
  if (!readyErrors.length) {
    return null
  }

  if (!mounted) {
    return null
  }

  return (
    <ErrorContext.Provider
      value={{
        rendered,
        transitionDurationMs,
      }}
    >
      <Errors
        debugInfo={state.debugInfo}
        isTurbopack={isTurbopack}
        readyErrors={readyErrors}
        versionInfo={state.versionInfo}
        onClose={() => {
          setIsErrorOverlayOpen(false)
        }}
      />
    </ErrorContext.Provider>
  )
}
