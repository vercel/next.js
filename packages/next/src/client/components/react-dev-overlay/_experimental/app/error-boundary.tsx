import type { GlobalErrorComponent } from '../../../error-boundary'

import { PureComponent } from 'react'
import { RuntimeErrorHandler } from '../internal/helpers/runtime-error-handler'

type ReactDevOverlayProps = {
  children: React.ReactNode[]
  onError: (value: boolean) => void
  globalError: [GlobalErrorComponent, React.ReactNode]
}

type ReactDevOverlayState = {
  isReactError: boolean
  reactError: unknown
}

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

export class ErrorBoundary extends PureComponent<
  ReactDevOverlayProps,
  ReactDevOverlayState
> {
  state = { isReactError: false, reactError: null }

  componentDidUpdate(
    _prevProps: ReactDevOverlayProps,
    prevState: ReactDevOverlayState
  ) {
    if (prevState.isReactError !== this.state.isReactError) {
      this.props.onError(this.state.isReactError)
    }
  }

  static getDerivedStateFromError(error: Error): ReactDevOverlayState {
    if (!error.stack) {
      return { isReactError: false, reactError: null }
    }

    RuntimeErrorHandler.hadRuntimeError = true

    return {
      isReactError: true,
      reactError: error,
    }
  }

  render() {
    const { children } = this.props
    const [content, devtools] = children

    const fallback = (
      <ErroredHtml
        globalError={this.props.globalError}
        error={this.state.reactError}
      />
    )

    return (
      <>
        {this.state.isReactError ? fallback : content}
        {devtools}
      </>
    )
  }
}
