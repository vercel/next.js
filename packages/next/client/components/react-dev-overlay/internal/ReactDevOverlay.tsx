import * as React from 'react'
import {
  ACTION_UNHANDLED_ERROR,
  OverlayState,
  UnhandledErrorAction,
} from './error-overlay-reducer'

import { ShadowPortal } from './components/ShadowPortal'
import { BuildError } from './container/BuildError'
import { Errors, SupportedErrorEvent } from './container/Errors'
import { Base } from './styles/Base'
import { ComponentStyles } from './styles/ComponentStyles'
import { CssReset } from './styles/CssReset'
import { parseStack } from './helpers/parseStack'
import { RootLayoutError } from './container/RootLayoutError'

interface ReactDevOverlayState {
  reactError: SupportedErrorEvent | null
}
class ReactDevOverlay extends React.PureComponent<
  {
    state: OverlayState
    children: React.ReactNode
  },
  ReactDevOverlayState
> {
  state = { reactError: null }

  static getDerivedStateFromError(error: Error): ReactDevOverlayState {
    const e = error
    const event: UnhandledErrorAction = {
      type: ACTION_UNHANDLED_ERROR,
      reason: error,
      frames: parseStack(e.stack!),
    }
    const errorEvent: SupportedErrorEvent = {
      id: 0,
      event,
    }
    return { reactError: errorEvent }
  }

  render() {
    const { state, children } = this.props
    const { reactError } = this.state

    const hasBuildError = state.buildError != null
    const hasRuntimeErrors = Boolean(state.errors.length)
    const rootLayoutMissingTagsError = state.rootLayoutMissingTagsError
    const isMounted =
      hasBuildError ||
      hasRuntimeErrors ||
      reactError ||
      rootLayoutMissingTagsError

    return (
      <>
        {reactError ? (
          <html>
            <head></head>
            <body></body>
          </html>
        ) : (
          children
        )}
        {isMounted ? (
          <ShadowPortal>
            <CssReset />
            <Base />
            <ComponentStyles />

            {rootLayoutMissingTagsError ? (
              <RootLayoutError
                missingTags={rootLayoutMissingTagsError.missingTags}
              />
            ) : hasBuildError ? (
              <BuildError message={state.buildError!} />
            ) : hasRuntimeErrors ? (
              <Errors errors={state.errors} />
            ) : reactError ? (
              <Errors errors={[reactError]} />
            ) : undefined}
          </ShadowPortal>
        ) : undefined}
      </>
    )
  }
}

export default ReactDevOverlay
