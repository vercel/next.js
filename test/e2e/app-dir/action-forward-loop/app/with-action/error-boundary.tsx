'use client'

import { Component, type ReactNode } from 'react'

interface State {
  hasError: boolean
}

// TODO: Once the action forwarder passes through the action-not-found
// response from the forwarded worker, branch on
// `unstable_isUnrecognizedActionError(error)` and render a dedicated UI so
// the test can assert specifically on that error kind instead of any error.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <p id="action-error">Action failed</p>
    }
    return this.props.children
  }
}
