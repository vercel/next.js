'use client'

import { useState } from 'react'
import { getModuleValue } from './cached'

export default function Client() {
  const [value, setValue] = useState('')

  return (
    <>
      <button
        id="read-module-value"
        onClick={async () => setValue(await getModuleValue())}
      >
        Read module value
      </button>
      <p id="client-value">{value}</p>
    </>
  )
}
