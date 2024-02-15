'use client'

import { useState } from 'react'
import { getDualOptoutValue } from './actions'
import * as dualPkgOptout from 'dual-pkg-optout'

export default function Page() {
  console.log('client component', dualPkgOptout)
  const [optoutDisplayValue, setOptoutDisplayValue] = useState('')
  return (
    <div id="dual-pkg-outout">
      <p>{optoutDisplayValue}</p>
      <button
        onClick={async () => {
          const text = await getDualOptoutValue()
          console.log('text', text)
          setOptoutDisplayValue(text)
        }}
      >
        dual-pkg-optout
      </button>
    </div>
  )
}
