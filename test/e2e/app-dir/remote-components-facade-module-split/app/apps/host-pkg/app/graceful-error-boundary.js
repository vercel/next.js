'use client'

import { Component } from 'react'

// Mirrors vercel-docs' graceful remote-component boundary: a broken remote
// component degrades to a marker instead of taking down the page.
export class GracefulErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <span id="remote-error">{String(this.state.error).slice(0, 200)}</span>
      )
    }
    return this.props.children
  }
}
