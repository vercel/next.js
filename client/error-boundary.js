// @flow
import * as React from 'react'

type ComponentDidCatchInfo = {
  componentStack: string
}

type Props = {|
  onError: (error: Error, info: ComponentDidCatchInfo) => void,
  children: React.ComponentType<*>
|}

class ErrorBoundary extends React.Component<Props> {
  componentDidCatch (error: Error, info: ComponentDidCatchInfo) {
    const {onError} = this.props
    // onError is required
    onError(error, info)
  }
  render () {
    const {children} = this.props
    return React.Children.only(children)
  }
}

export default ErrorBoundary
