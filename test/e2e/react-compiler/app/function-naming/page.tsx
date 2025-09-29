'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [callFrame, setCallFrame] = useState(null)
  useEffect(() => {
    const error = new Error('test-top-frame')
    console.error(error)

    const callStack = new Error('test-top-frame').stack.split(
      'test-top-frame\n'
    )[1]
    // indices might change due to different compiler optimizations
    const callFrame = callStack.split('\n')[0]
    setCallFrame(callFrame)
  }, [])
  return (
    <pre data-testid="call-frame" aria-busy={callFrame === null}>
      {String(callFrame)}
    </pre>
  )
}
