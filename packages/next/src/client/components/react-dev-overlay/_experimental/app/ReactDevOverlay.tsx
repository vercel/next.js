import type { OverlayState } from '../../shared'
import type { Dispatcher } from '../../app/hot-reloader-client'

import React from 'react'

import { ShadowPortal } from '../internal/components/ShadowPortal'
import { BuildError } from '../internal/container/BuildError'
import { Errors } from '../internal/container/Errors'
import { Base } from '../internal/styles/Base'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'
import { RootLayoutMissingTagsError } from '../internal/container/RootLayoutMissingTagsError'
import { RuntimeErrorHandler } from '../internal/helpers/runtime-error-handler'
import { Colors } from '../internal/styles/colors'

interface ReactDevOverlayState {
  isReactError: boolean
}
export default class ReactDevOverlay extends React.PureComponent<
  {
    state: OverlayState
    dispatcher?: Dispatcher
    children: React.ReactNode
  },
  ReactDevOverlayState
> {
  state = { isReactError: false }

  static getDerivedStateFromError(error: Error): ReactDevOverlayState {
    if (!error.stack) return { isReactError: false }

    RuntimeErrorHandler.hadRuntimeError = true
    return {
      isReactError: true,
    }
  }

  render() {
    const { state, children } = this.props
    const { isReactError } = this.state

    const hasBuildError = state.buildError != null
    const hasStaticIndicator = state.staticIndicator
    const debugInfo = state.debugInfo

    return (
      <>
        {isReactError ? (
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
          <Colors />
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
            <Errors
              isTurbopackEnabled={!!process.env.TURBOPACK}
              isAppDir={true}
              initialDisplayState={isReactError ? 'fullscreen' : 'minimized'}
              errors={state.errors}
              versionInfo={state.versionInfo}
              hasStaticIndicator={hasStaticIndicator}
              debugInfo={debugInfo}
            />
          )}
        </ShadowPortal>
      </>
    )
  }
}
