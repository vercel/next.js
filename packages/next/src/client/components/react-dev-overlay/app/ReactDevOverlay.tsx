import * as React from 'react'
import { ACTION_UNHANDLED_ERROR, type OverlayState } from '../shared'

import { ShadowPortal } from '../internal/components/ShadowPortal'
import { BuildError } from '../internal/container/BuildError'
import { Errors } from '../internal/container/Errors'
import type { SupportedErrorEvent } from '../internal/container/Errors'
import { parseStack } from '../internal/helpers/parseStack'
import { Base } from '../internal/styles/Base'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'
import { RootLayoutMissingTagsError } from '../internal/container/root-layout-missing-tags-error'

interface ReactDevOverlayState {
  reactError: SupportedErrorEvent | null
}
export default class ReactDevOverlay extends React.PureComponent<
  {
    state: OverlayState
    children: React.ReactNode
    onReactError: (error: Error) => void
  },
  ReactDevOverlayState
> {
  state = { reactError: null }

  static getDerivedStateFromError(error: Error): ReactDevOverlayState {
    if (!error.stack) return { reactError: null }
    return {
      reactError: {
        id: 0,
        event: {
          type: ACTION_UNHANDLED_ERROR,
          reason: error,
          frames: parseStack(error.stack),
        },
      },
    }
  }

  componentDidCatch(componentErr: Error) {
    this.props.onReactError(componentErr)
  }

  render() {
    const { state, children } = this.props
    const { reactError } = this.state

    const hasBuildError = state.buildError != null
    const hasRuntimeErrors = Boolean(state.errors.length)
    const hasMissingTags = Boolean(state.rootLayoutMissingTags?.length)
    const isMounted =
      hasBuildError || hasRuntimeErrors || reactError || hasMissingTags

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
            {state.rootLayoutMissingTags?.length ? (
              <RootLayoutMissingTagsError
                missingTags={state.rootLayoutMissingTags}
              />
            ) : hasBuildError ? (
              <BuildError
                errors={state.errors}
                message={state.buildError!}
                versionInfo={state.versionInfo}
              />
            ) : reactError ? (
              <Errors
                isAppDir={true}
                versionInfo={state.versionInfo}
                initialDisplayState="fullscreen"
                errors={[reactError]}
              />
            ) : hasRuntimeErrors ? (
              <Errors
                isAppDir={true}
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
