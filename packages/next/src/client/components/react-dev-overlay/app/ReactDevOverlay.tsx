import type { AppDevOverlayProps, AppDevOverlayState } from '../types'
import React from 'react'
import { Base } from '../internal/styles/Base'
import { BuildError } from '../internal/container/BuildError'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'
import { Errors } from '../internal/container/Errors'
import { RootLayoutMissingTagsError } from '../internal/container/root-layout-missing-tags-error'
import { RuntimeErrorHandler } from '../internal/helpers/runtime-error-handler'
import { ShadowPortal } from '../internal/components/ShadowPortal'
import { StaticIndicator } from '../internal/container/StaticIndicator'

export default class ReactDevOverlay extends React.PureComponent<
  AppDevOverlayProps,
  AppDevOverlayState
> {
  state: AppDevOverlayState = { isReactError: false }

  static getDerivedStateFromError(error: Error): AppDevOverlayState {
    if (!error.stack) {
      return { isReactError: false }
    }

    RuntimeErrorHandler.hadRuntimeError = true
    return { isReactError: true }
  }

  renderErrorContent() {
    const { state, dispatcher } = this.props
    const { isReactError } = this.state

    // Root layout missing html or body tag
    if (state.rootLayoutMissingTags?.length) {
      return (
        <RootLayoutMissingTagsError missingTags={state.rootLayoutMissingTags} />
      )
    }

    // Has Build Error
    if (state.buildError != null) {
      return (
        <BuildError
          message={state.buildError}
          versionInfo={state.versionInfo}
        />
      )
    }

    return (
      <>
        {/* Has Runtime Error */}
        {Boolean(state.errors.length) && (
          <Errors
            isAppDir={true}
            initialDisplayState={isReactError ? 'fullscreen' : 'minimized'}
            errors={state.errors}
            versionInfo={state.versionInfo}
            hasStaticIndicator={state.staticIndicator}
            debugInfo={state.debugInfo}
          />
        )}

        {state.staticIndicator && <StaticIndicator dispatcher={dispatcher} />}
      </>
    )
  }

  render() {
    const { children } = this.props
    const { isReactError } = this.state

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
          <ComponentStyles />
          {this.renderErrorContent()}
        </ShadowPortal>
      </>
    )
  }
}
