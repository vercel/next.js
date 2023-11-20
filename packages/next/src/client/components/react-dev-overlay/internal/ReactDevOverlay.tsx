import * as React from 'react'
import { ACTION_UNHANDLED_ERROR } from './error-overlay-reducer'
import type {
  OverlayState,
  UnhandledErrorAction,
} from './error-overlay-reducer'

import { ShadowPortal } from './components/ShadowPortal'
import { Errors, type SupportedErrorEvent } from './container/Errors'
import { parseStack } from './helpers/parseStack'
import { Base } from './styles/Base'
import { ComponentStyles } from './styles/ComponentStyles'
import { CssReset } from './styles/CssReset'

type ReactDevOverlayProps = {
  state: OverlayState
  children: React.ReactNode
  onReactError: (error: Error) => void
}

type ReactDevOverlayState = {
  reactError: SupportedErrorEvent | null
}

class ReactDevOverlay extends React.PureComponent<
  ReactDevOverlayProps,
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

            <Errors
              buildErrors={
                state.buildError ? [{ message: state.buildError }] : []
              }
              errors={reactError ? [reactError] : state.errors}
              rootLayoutError={rootLayoutMissingTagsError}
              versionInfo={state.versionInfo}
            />
          </ShadowPortal>
        ) : undefined}
      </>
    )
  }
}

export default ReactDevOverlay
