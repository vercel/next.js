'use client'

import { useState } from 'react'
import { revalidateConcretePage } from './actions'

export function Button() {
  const [result, setResult] = useState('not called')

  return (
    <>
      <button
        id="revalidate-concrete"
        onClick={async () => {
          setResult(await revalidateConcretePage())
        }}
      >
        revalidate concrete page
      </button>
      <p id="concrete-action-result">{result}</p>
    </>
  )
}
