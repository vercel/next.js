'use client'

import React from 'react'

export const NEXT_DYNAMIC_NO_SSR_CODE = 'DYNAMIC_SERVER_USAGE'

class DynamicErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { noSSR: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { noSSR: false }
  }

  static getDerivedStateFromError(error: any) {
    console.log('error.digest', error.digest, error.message)
    if (error.digest === 'DYNAMIC_SERVER_USAGE') {
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
