'use client'

import { useState } from 'react'

import { getValue } from './actions'

export default function Counter() {
  const [value, setValue] = useState(0)
  return (
    <div>
      <h1>{value}</h1>
      <button
        onClick={async () => {
          const value = await getValue()
          setValue(value)
        }}
      >
        Get
      </button>
    </div>
  )
}
