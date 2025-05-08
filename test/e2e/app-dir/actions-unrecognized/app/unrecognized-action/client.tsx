'use client'
import * as React from 'react'
import { useActionState } from 'react'

export function ClientForm<T>({
  action,
  argument,
  id,
  children,
}: {
  action: (state: string, argument: T) => Promise<string>
  argument: T
  id: string
  children?: React.ReactNode
}) {
  const [state, dispatch] = useActionState(
    // don't use `bind()`, we want to explicitly avoid getting a FormData argument
    // because that always results in a FormData request
    (state) => action(state, argument),
    'initial-state'
  )
  return (
    <form id={id} action={dispatch}>
      <button type="submit">{children}</button>
      <span className="form-state">{`${state}`}</span>
    </form>
  )
}

export function ServerForm({
  action,
}: {
  action: (state: string, formData: FormData) => Promise<string>
}) {
  const [state, dispatch] = useActionState(action, 'initial-state')
  return (
    <form action={dispatch} id="server-form">
      <button type="submit">Submit server form</button>
      <span className="form-state">{`${state}`}</span>
    </form>
  )
}

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
