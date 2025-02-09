import type { OverlayState } from '../../../../../shared'

import { BuildError } from '../../../container/build-error'
import { Errors } from '../../../container/errors'
import { RootLayoutMissingTagsError } from '../../../container/root-layout-missing-tags-error'
import { useDelayedRender } from '../../../hooks/use-delayed-render'
import type { ReadyRuntimeError } from '../../../../../internal/helpers/get-error-by-type'

const transitionDurationMs = 200

export interface ErrorBaseProps {
  rendered: boolean
  transitionDurationMs: number
  isTurbopack: boolean
  versionInfo: OverlayState['versionInfo']
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

  const commonProps = {
    rendered,
    transitionDurationMs,
    isTurbopack,
    versionInfo: state.versionInfo,
  }

  if (!!state.rootLayoutMissingTags?.length) {
    return (
      <RootLayoutMissingTagsError
        {...commonProps}
        // This is a runtime error, forcedly display error overlay
        rendered
        missingTags={state.rootLayoutMissingTags}
      />
    )
  }

  if (state.buildError !== null) {
    return <BuildError {...commonProps} message={state.buildError} />
  }

  // No Runtime Errors.
  if (!readyErrors.length) {
    return null
  }

  if (!mounted) {
    return null
  }

  return (
    <Errors
      {...commonProps}
      debugInfo={state.debugInfo}
      readyErrors={readyErrors}
      onClose={() => {
        setIsErrorOverlayOpen(false)
      }}
    />
  )
}
