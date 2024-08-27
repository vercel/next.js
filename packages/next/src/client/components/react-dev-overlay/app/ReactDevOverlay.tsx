import * as React from 'react'
import { ACTION_UNHANDLED_ERROR, type OverlayState } from '../shared'

import { ShadowPortal } from '../internal/components/ShadowPortal'
import { BuildError } from '../internal/container/BuildError'
import { Errors } from '../internal/container/Errors'
import { StaticIndicator } from '../internal/container/StaticIndicator'
import type { SupportedErrorEvent } from '../internal/container/Errors'
import { parseStack } from '../internal/helpers/parseStack'
import { Base } from '../internal/styles/Base'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'
import { RootLayoutMissingTagsError } from '../internal/container/root-layout-missing-tags-error'
import type { Dispatcher } from './hot-reloader-client'

interface ReactDevOverlayState {
  reactError: SupportedErrorEvent | null
}
export default class ReactDevOverlay extends React.PureComponent<
  {
    state: OverlayState
    dispatcher?: Dispatcher
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
    const { state, children, dispatcher } = this.props
    const { reactError } = this.state

    const hasBuildError = state.buildError != null
    const hasRuntimeErrors = Boolean(state.errors.length)
    const hasStaticIndicator = state.staticIndicator

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
              message={state.buildError!}
              versionInfo={state.versionInfo}
            />
          ) : (
            <>
              {reactError ? (
                <Errors
                  isAppDir={true}
                  versionInfo={state.versionInfo}
                  initialDisplayState="fullscreen"
                  errors={[reactError]}
                  hasStaticIndicator={hasStaticIndicator}
                />
              ) : hasRuntimeErrors ? (
                <Errors
                  isAppDir={true}
                  initialDisplayState="minimized"
                  errors={state.errors}
                  versionInfo={state.versionInfo}
                  hasStaticIndicator={hasStaticIndicator}
                />
              ) : null}

              {hasStaticIndicator && (
                <StaticIndicator dispatcher={dispatcher} />
              )}
            </>
          )}
        </ShadowPortal>
      </>
    )
  }
}
