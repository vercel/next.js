'use client'

import { Component, Suspense } from 'react'

export default class ErrorBoundary extends Component<
  { id: string; children: React.ReactNode },
  { message: null | string }
> {
  state = { message: null }
  static getDerivedStateFromError(error: any) {
    return { message: error.message }
  }
  render() {
    let content
    if (this.state.message !== null) {
      content = this.state.message
    } else {
      content = this.props.children
    }
    return (
      <p id={this.props.id}>
        <Suspense>{content}</Suspense>
      </p>
    )
  }
}
