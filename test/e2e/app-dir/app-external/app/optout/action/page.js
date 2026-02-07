'use client'

import { useState } from 'react'
import { getDualOptoutValue } from './actions'

export default function Page() {
  const [optoutDisplayValue, setOptoutDisplayValue] = useState('initial')
  return (
    <div id="dual-pkg-outout">
      <p>{optoutDisplayValue}</p>
      <button
        onClick={async () => {
          setOptoutDisplayValue(await getDualOptoutValue())
        }}
      >
        dual-pkg-optout
      </button>
    </div>
  )
}
