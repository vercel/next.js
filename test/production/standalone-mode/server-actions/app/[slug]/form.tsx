'use client'

import { Component, type ReactNode } from 'react'
import { useActionState } from 'react'

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }

  render() {
    if (this.state.error) {
      return (
        <p id="result" style={{ color: 'red' }}>
          {this.state.error}
        </p>
      )
    }

    return this.props.children
  }
}

function Form({ action }: { action: () => Promise<string> }) {
  const [result, formAction] = useActionState(action, '')

  return (
    <form action={formAction}>
      <button>Submit</button>
      {result && (
        <p id="result" style={{ color: 'green' }}>
          {result}
        </p>
      )}
    </form>
  )
}

export function FormWithErrorBoundary({
  action,
}: {
  action: () => Promise<string>
}) {
  return (
    <ErrorBoundary>
      <Form action={action} />
    </ErrorBoundary>
  )
}
