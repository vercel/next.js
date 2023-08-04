import React from 'react'

type State = {
  error?: Error | null
}

type Props = {
  children: React.ReactNode
  showRetry: React.ReactNode
}

export default class UserScreenErrorBoundary extends React.Component<
  Props,
  State
> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error: error }
  }

  componentDidCatch(error: Error) {}

  render() {
    if (this.state.error) {
      return this.props.showRetry
    }
    return this.props.children
  }
}
