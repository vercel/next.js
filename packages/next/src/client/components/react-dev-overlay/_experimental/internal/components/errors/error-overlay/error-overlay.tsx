import type { OverlayState } from '../../../../../shared'

import { BuildError } from '../../../container/build-error'
import { Errors } from '../../../container/errors'
import { RootLayoutMissingTagsError } from '../../../container/root-layout-missing-tags-error'
import type { ReadyRuntimeError } from '../../../../../internal/helpers/get-error-by-type'

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

  if (!isErrorOverlayOpen) {
    return null
  }

  return (
    <Errors
      debugInfo={state.debugInfo}
      isTurbopack={isTurbopack}
      readyErrors={readyErrors}
      versionInfo={state.versionInfo}
      onClose={() => {
        setIsErrorOverlayOpen(false)
      }}
    />
  )
}
