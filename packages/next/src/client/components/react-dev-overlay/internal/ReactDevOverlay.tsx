import * as React from 'react'
import { ACTION_UNHANDLED_ERROR } from './error-overlay-reducer'
import type {
  OverlayState,
  UnhandledErrorAction,
} from './error-overlay-reducer'

import { ShadowPortal } from './components/ShadowPortal'
import { BuildError } from './container/BuildError'
import { Errors } from './container/Errors'
import type { SupportedErrorEvent } from './container/Errors'
import { RootLayoutError } from './container/RootLayoutError'
import { parseStack } from './helpers/parseStack'
import { Base } from './styles/Base'
import { ComponentStyles } from './styles/ComponentStyles'
import { CssReset } from './styles/CssReset'

interface ReactDevOverlayState {
  reactError: SupportedErrorEvent | null
}
class ReactDevOverlay extends React.PureComponent<
  {
    state: OverlayState
    children: React.ReactNode
    onReactError: (error: Error) => void
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

  componentDidCatch(componentErr: Error) {
    this.props.onReactError(componentErr)
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
              <BuildError
                message={state.buildError!}
                versionInfo={state.versionInfo}
              />
            ) : reactError ? (
              <Errors
                versionInfo={state.versionInfo}
                initialDisplayState="fullscreen"
                errors={[reactError]}
              />
            ) : hasRuntimeErrors ? (
              <Errors
                initialDisplayState="minimized"
                errors={state.errors}
                versionInfo={state.versionInfo}
              />
            ) : undefined}
          </ShadowPortal>
        ) : undefined}
      </>
    )
  }
}

export default ReactDevOverlay
