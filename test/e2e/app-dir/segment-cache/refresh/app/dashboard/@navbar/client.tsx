'use client'

import { useState } from 'react'

export function RenderCounterClient({ uuid }: { uuid: string }) {
  const [counter, setCounter] = useState(0)
  const [prevUuid, setPrevUuid] = useState(uuid)
  if (prevUuid !== uuid) {
    // A new dynamic value was received from the server. Increment the counter.
    setPrevUuid(uuid)
    setCounter(counter + 1)
  }
  return counter
}
