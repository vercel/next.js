'use client'

import { Component } from 'react'

class MyErrorBoundary extends Component {
  static getDerivedStateFromError(error) {
    return { error }
  }

  state = { error: null }

  render() {
    if (this.state.error) {
      return 'failed'
    }
    return this.props.children
  }
}

function Inner() {
  return (
    <MyErrorBoundary>
      <Thrower />
    </MyErrorBoundary>
  )
}

function Thrower() {
  useErrorHook()
}

function useThrowError() {
  if (typeof window !== 'undefined') {
    throw new Error('browser error')
  }
}

function useErrorHook() {
  useThrowError()
}

export default function Page() {
  return <Inner />
}
