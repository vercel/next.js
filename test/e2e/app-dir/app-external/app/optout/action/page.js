'use client'

import { useState } from 'react'
import { getDualOptoutValue } from './actions'

export default function Page() {
  const [optoutDisplayValue, setOptoutDisplayValue] = useState('')
  return (
    <div id="dual-pkg-outout">
      <p>{optoutDisplayValue}</p>
      <button
        onClick={async () => {
          const text = await getDualOptoutValue()
          // console.log('text', text)
          setOptoutDisplayValue(text)
        }}
      >
        dual-pkg-optout
      </button>
    </div>
  )
}
