import React, { PureComponent, startTransition } from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'
import { RuntimeErrorHandler } from '../../../client/dev/runtime-error-handler'
import { ErrorBoundary } from '../../../client/components/error-boundary'
import DefaultGlobalError from '../../../client/components/builtin/global-error'
import type { GlobalErrorState } from '../../../client/components/app-router-instance'
import { SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE } from './segment-explorer-node'
import {
  AppRouterContext,
  type AppRouterInstance,
} from '../../../shared/lib/app-router-context.shared-runtime'
import isError from '../../../lib/is-error'

type AppDevOverlayErrorBoundaryProps = {
  children: React.ReactNode
  globalError: GlobalErrorState
}

type AppDevOverlayErrorBoundaryState = {
  error: null | { thrownValue: unknown }
}

function ErroredHtml({
  globalError: [GlobalError, globalErrorStyles],
  thrownValue,
  reset,
  retry,
}: {
  globalError: GlobalErrorState
  thrownValue: unknown
  reset: () => void
  retry: () => void
}) {
  return (
    <ErrorBoundary errorComponent={DefaultGlobalError}>
      {globalErrorStyles}
      <GlobalError error={thrownValue} reset={reset} retry={retry} />
    </ErrorBoundary>
  )
}

export class AppDevOverlayErrorBoundary extends PureComponent<
  AppDevOverlayErrorBoundaryProps,
  AppDevOverlayErrorBoundaryState
> {
  static contextType = AppRouterContext
  declare context: AppRouterInstance | null

  state: AppDevOverlayErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(
    thrownValue: Error
  ): Partial<AppDevOverlayErrorBoundaryState> {
    RuntimeErrorHandler.hadRuntimeError = true

    return {
      error: { thrownValue },
    }
  }

  componentDidCatch(err: unknown) {
    if (
      process.env.NODE_ENV === 'development' &&
      isError(err) &&
      err.message === SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE
    ) {
      return
    }
    dispatcher.openErrorOverlay()
  }

  retry = () => {
    startTransition(() => {
      this.context?.refresh()
      this.reset()
    })
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { children, globalError } = this.props
    const { error } = this.state

    if (error !== null) {
      const thrownValue = error.thrownValue
      return (
        <ErroredHtml
          globalError={globalError}
          thrownValue={thrownValue}
          reset={this.reset}
          retry={this.retry}
        />
      )
    }

    return children
  }
}
