'use client'

import { useState } from 'react'
import { getValue } from './actions'

export function Client() {
  const [value, setValue] = useState('')

  return (
    <>
      <button id="run-action" onClick={() => getValue().then(setValue)}>
        Run action
      </button>
      <p id="value">{value}</p>
    </>
  )
}
