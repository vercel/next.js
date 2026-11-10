'use client'

import { Component, type ReactNode } from 'react'
import { unstable_isUnrecognizedActionError } from 'next/navigation'

interface State {
  error: unknown
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error === null) {
      return this.props.children
    }
    if (unstable_isUnrecognizedActionError(error)) {
      return <p id="action-not-found-error">Server action not found</p>
    }
    return <p id="unexpected-error">Unexpected error</p>
  }
}
