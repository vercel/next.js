'use client'

import { Component, createContext, use, useState } from 'react'

const ShouldFallbackThrowContext = createContext(false)

export function ShouldFallbackThrowContainer({ children }) {
  const [shouldFallbackThrow, setShouldFallbackThrow] = useState(false)
  return (
    <>
      <label>
        Throw if fallback appears
        <input
          id="should-fallback-throw"
          type="checkbox"
          checked={shouldFallbackThrow}
          onChange={(e) => setShouldFallbackThrow(e.target.checked)}
        />
      </label>
      <ShouldFallbackThrowContext.Provider value={shouldFallbackThrow}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </ShouldFallbackThrowContext.Provider>
    </>
  )
}

export function Fallback({ children }) {
  if (use(ShouldFallbackThrowContext)) {
    throw new Error('Unexpected fallback')
  }
  return children
}

class ErrorBoundary extends Component<{ children: React.ReactNode }> {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return <div id="error">{this.state.error.message}</div>
    }
    return this.props.children
  }
}
