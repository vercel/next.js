import { Component, type ReactNode } from 'react'

class TestErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    return this.state.hasError ? (
      <p id="pages-caught-fallback">Caught fallback</p>
    ) : (
      this.props.children
    )
  }
}

function BrokenComponent(): ReactNode {
  if (typeof window !== 'undefined') {
    throw new Error('Test Pages caught runtime error')
  }

  return <p>Server render</p>
}

export default function PagesCaughtRuntimeErrorPage() {
  return (
    <TestErrorBoundary>
      <BrokenComponent />
    </TestErrorBoundary>
  )
}
