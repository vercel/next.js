'use client'

import { useState } from 'react'

export default function Page() {
  const [value, setValue] = useState('idle')
  return (
    <>
      <button
        id="load"
        onClick={() =>
          import('./target').then((target) => setValue(target.value))
        }
      >
        load
      </button>
      <p id="value">{value}</p>
    </>
  )
}
