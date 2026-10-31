'use client'
import { Component, useState, type ReactNode } from 'react'
const error = new Error('reused error')
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p id="fallback">Caught</p> : this.props.children
  }
}
function Thrower({ failed }: { failed: boolean }) {
  if (failed) {
    throw error
  }
  return null
}
export default function Page() {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <button id="log" onClick={() => console.error(error)}>
        Log
      </button>
      <button id="throw" onClick={() => setFailed(true)}>
        Throw
      </button>
      <Boundary>
        <Thrower failed={failed} />
      </Boundary>
    </>
  )
}
