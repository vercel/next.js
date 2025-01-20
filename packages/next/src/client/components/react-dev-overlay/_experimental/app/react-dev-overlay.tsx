import type { OverlayState } from '../../shared'
import type { Dispatcher } from '../../app/hot-reloader-client'

import React from 'react'

import { ShadowPortal } from '../internal/components/shadow-portal'
import { BuildError } from '../internal/container/build-error'
import { Errors } from '../internal/container/errors'
import { Base } from '../internal/styles/base'
import { ComponentStyles } from '../internal/styles/component-styles'
import { CssReset } from '../internal/styles/css-reset'
import { RootLayoutMissingTagsError } from '../internal/container/root-layout-missing-tags-error'
import { RuntimeErrorHandler } from '../internal/helpers/runtime-error-handler'
import { Colors } from '../internal/styles/colors'
import type { GlobalErrorComponent } from '../../../error-boundary'

function ErroredHtml({
  globalError: [GlobalError, globalErrorStyles],
  error,
}: {
  globalError: [GlobalErrorComponent, React.ReactNode]
  error: unknown
}) {
  if (!error) {
    return (
      <html>
        <head />
        <body />
      </html>
    )
  }
  return (
    <>
      {globalErrorStyles}
      <GlobalError error={error} />
    </>
  )
}

interface ReactDevOverlayState {
  reactError?: unknown
  isReactError: boolean
}
export default class ReactDevOverlay extends React.PureComponent<
  {
    state: OverlayState
    dispatcher?: Dispatcher
    globalError: [GlobalErrorComponent, React.ReactNode]
    children: React.ReactNode
  },
  ReactDevOverlayState
> {
  state = {
    reactError: null,
    isReactError: false,
  }

  static getDerivedStateFromError(error: Error): ReactDevOverlayState {
    if (!error.stack) return { isReactError: false }

    RuntimeErrorHandler.hadRuntimeError = true
    return {
      isReactError: true,
    }
  }

  render() {
    const { state, children, globalError } = this.props
    const { isReactError, reactError } = this.state

    const hasBuildError = state.buildError != null
    const hasStaticIndicator = state.staticIndicator
    const debugInfo = state.debugInfo

    const isTurbopack = !!process.env.TURBOPACK

    return (
      <>
        {isReactError ? (
          <ErroredHtml globalError={globalError} error={reactError} />
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
              isTurbopack={isTurbopack}
            />
          ) : hasBuildError ? (
            <BuildError
              message={state.buildError!}
              versionInfo={state.versionInfo}
              isTurbopack={isTurbopack}
            />
          ) : (
            <Errors
              isTurbopack={isTurbopack}
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
