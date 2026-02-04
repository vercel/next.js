'use client'

import React from 'react'

export class ErrorBoundary extends React.Component<{
  children: React.ReactNode
}> {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div id="error-boundary">
          Error boundary: {this.state.error.message}
        </div>
      )
    }
    return this.props.children
  }
}
