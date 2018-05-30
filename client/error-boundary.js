// @flow
import * as React from 'react'
import {polyfill} from 'react-lifecycles-compat'

type ComponentDidCatchInfo = {
  componentStack: string
}

type Info = null | ComponentDidCatchInfo

export type ErrorReporterProps = {error: Error, info: Info}
type ErrorReporterComponent = React.ComponentType<ErrorReporterProps>

type Props = {
  ErrorReporter: null | ErrorReporterComponent,
  onError: (error: Error, info: ComponentDidCatchInfo) => void,
  children: React.ComponentType<*>
}

type State = {
  error: null | Error,
  info: Info
}

class ErrorBoundary extends React.Component<Props, State> {
  state = {
    error: null,
    info: null
  }
  static getDerivedStateFromProps () {
    return {
      error: null,
      info: null
    }
  }
  componentDidCatch (error: Error, info: ComponentDidCatchInfo) {
    const {onError} = this.props

    // onError is provided in production
    if (onError) {
      onError(error, info)
    } else {
      this.setState({ error, info })
    }
  }
  render () {
    const {ErrorReporter, children} = this.props
    const {error, info} = this.state
    if (ErrorReporter && error) {
      return <ErrorReporter error={error} info={info} />
    }

    return React.Children.only(children)
  }
}

// Makes sure we can use React 16.3 lifecycles and still support older versions of React.
polyfill(ErrorBoundary)

export default ErrorBoundary
