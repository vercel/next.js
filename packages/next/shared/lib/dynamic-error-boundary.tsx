'use client'

import React from 'react'
import { NEXT_DYNAMIC_NO_SSR_CODE } from './no-ssr-error'

class DynamicErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { noSSR: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { noSSR: false }
  }

  static getDerivedStateFromError(error: any) {
    if (error.digest === NEXT_DYNAMIC_NO_SSR_CODE) {
      return { noSSR: true }
    }
    // Re-throw if error is not for dynamic
    throw error
  }

  render() {
    if (this.state.noSSR) {
      return null
    }
    return this.props.children
  }
}

export default function DynamicBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  return <DynamicErrorBoundary>{children}</DynamicErrorBoundary>
}
