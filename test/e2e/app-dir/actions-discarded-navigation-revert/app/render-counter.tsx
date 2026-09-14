'use client'

import { useState } from 'react'

// Counts how many times the client received new dynamic data for the root
// layout. The count lives in client state: a server-side counter would break
// in deploy tests, where the server is stateless.
export function RenderCounter({ uuid }: { uuid: string }) {
  const [count, setCount] = useState(0)
  const [prevUuid, setPrevUuid] = useState(uuid)
  if (prevUuid !== uuid) {
    setPrevUuid(uuid)
    setCount(count + 1)
  }
  return (
    <div id="stamp" data-render={count}>
      renders:{count}
    </div>
  )
}
