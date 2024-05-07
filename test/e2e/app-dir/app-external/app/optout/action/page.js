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
          const value = await getDualOptoutValue()
          setOptoutDisplayValue(value)
        }}
      >
        dual-pkg-optout
      </button>
    </div>
  )
}
