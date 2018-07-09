// @flow
import * as React from 'react'
import {polyfill} from 'react-lifecycles-compat'

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

    // onError is provided in production
    if (onError) {
      onError(error, info)
    } else {
      throw error
    }
  }
  render () {
    const {children} = this.props
    return React.Children.only(children)
  }
}

// Makes sure we can use React 16.3 lifecycles and still support older versions of React.
polyfill(ErrorBoundary)

export default ErrorBoundary
