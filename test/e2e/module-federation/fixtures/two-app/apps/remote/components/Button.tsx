'use client'

import React, { useState } from 'react'
import { marker } from 'remote-shared-marker'

export const reactInstance = React

export default function Button({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount)

  return (
    <>
      <p id="shared-marker">{marker}</p>
      <button id="remote-button" onClick={() => setCount((value) => value + 1)}>
        remote count: {count}
      </button>
    </>
  )
}
