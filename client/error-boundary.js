// @flow
import * as React from 'react'
import {polyfill} from 'react-lifecycles-compat'

type ComponentDidCatchInfo = {
  componentStack: string
}

export type Info = null | ComponentDidCatchInfo

export type RuntimeError = Error & {|
  module: ?{|
    rawRequest: string
  |}
|}

export type ErrorReporterProps = {|error: RuntimeError, info: Info|}
type ErrorReporterComponent = React.ComponentType<ErrorReporterProps>

type Props = {|
  ErrorReporter: null | ErrorReporterComponent,
  onError: (error: RuntimeError, info: ComponentDidCatchInfo) => void,
  children: React.ComponentType<*>
|}

type State = {|
  error: null | RuntimeError,
  info: Info
|}

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
  componentDidCatch (error: RuntimeError, info: ComponentDidCatchInfo) {
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
