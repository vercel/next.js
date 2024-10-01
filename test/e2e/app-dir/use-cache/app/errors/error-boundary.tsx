'use client'

import { Component } from 'react'

export default class ErrorBoundary extends Component<
  { id: string; children: React.ReactNode },
  { message: null | string }
> {
  state = { message: null }
  static getDerivedStateFromError(error: any) {
    return { message: error.message }
  }
  render() {
    if (this.state.message !== null) {
      return <p id={this.props.id}>{this.state.message}</p>
    }
    return this.props.children
  }
}
