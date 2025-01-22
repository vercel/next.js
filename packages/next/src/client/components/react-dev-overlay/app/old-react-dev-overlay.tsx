import React from 'react'
import type { OverlayState } from '../shared'
import { ShadowPortal } from '../internal/components/ShadowPortal'
import { BuildError } from '../internal/container/BuildError'
import { Errors } from '../internal/container/Errors'
import { StaticIndicator } from '../internal/container/StaticIndicator'
import { Base } from '../internal/styles/Base'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'
import { RootLayoutMissingTagsError } from '../internal/container/RootLayoutMissingTagsError'
import type { Dispatcher } from './hot-reloader-client'
import { RuntimeErrorHandler } from '../../errors/runtime-error-handler'
import type { GlobalErrorComponent } from '../../error-boundary'

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
    globalError: [GlobalErrorComponent, React.ReactNode]
    dispatcher?: Dispatcher
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
      reactError: error,
      isReactError: true,
    }
  }

  render() {
    const { state, children, dispatcher, globalError } = this.props
    const { isReactError, reactError } = this.state

    const hasBuildError = state.buildError != null
    const hasRuntimeErrors = Boolean(state.errors.length)
    const hasStaticIndicator = state.staticIndicator
    const debugInfo = state.debugInfo

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
              {hasRuntimeErrors ? (
                <Errors
                  isAppDir={true}
                  initialDisplayState={
                    isReactError ? 'fullscreen' : 'minimized'
                  }
                  errors={state.errors}
                  versionInfo={state.versionInfo}
                  hasStaticIndicator={hasStaticIndicator}
                  debugInfo={debugInfo}
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
