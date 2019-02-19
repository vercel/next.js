import React from 'react'

class ErrorBoundary extends React.Component {
  componentDidCatch (error, info) {
    const { onError } = this.props
    // onError is required
    onError(error, info)
  }
  render () {
    const { children } = this.props
    return React.Children.only(children)
  }
}

export default ErrorBoundary
