'use client'
import { Component, useState, type ReactNode } from 'react'
class CustomBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <p id="fallback">Class fallback</p>
    ) : (
      this.props.children
    )
  }
}
function Broken() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    throw new Error('class failed')
  }
  return (
    <button id="throw" onClick={() => setFailed(true)}>
      Throw
    </button>
  )
}
export default function Page() {
  return (
    <CustomBoundary>
      <Broken />
    </CustomBoundary>
  )
}
