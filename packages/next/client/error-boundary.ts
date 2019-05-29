import React, { ErrorInfo } from 'react'

export class ErrorBoundary extends React.Component<{
  fn: (err: Error, info: ErrorInfo) => void
}> {
  componentDidCatch(err: Error, info: ErrorInfo) {
    this.props.fn(err, info)
  }
  render() {
    return this.props.children
  }
}
