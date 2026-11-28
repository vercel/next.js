'use client'

import { useState } from 'react'
import { typedValue } from './value.customts'
import { ordinaryValue } from './ordinary'

export default function Client() {
  const [result, setResult] = useState('not clicked')
  return (
    <section>
      <p id="client-custom">{typedValue(3)}</p>
      <p id="client-control">{ordinaryValue(3)}</p>
      <button id="run-custom" onClick={() => setResult(typedValue(4))}>
        Run typed function
      </button>
      <p id="client-result">{result}</p>
    </section>
  )
}
