'use client'

import { useState } from 'react'
import { readCachedValue } from './action'

export default function Client() {
  const [value, setValue] = useState('')
  return (
    <>
      <button
        id="run-action"
        onClick={async () => setValue(await readCachedValue())}
      >
        Read cached value
      </button>
      <p id="action-data">{value}</p>
    </>
  )
}
