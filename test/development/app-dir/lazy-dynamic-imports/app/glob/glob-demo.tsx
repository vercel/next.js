'use client'

import { useState } from 'react'

const targets = import.meta.glob<{ value: string }>('./targets/*.ts')

export function GlobDemo() {
  const [value, setValue] = useState('idle')

  return (
    <button
      id="load-glob"
      onClick={async () => {
        const module = await targets['./targets/a.ts']()
        setValue(module.value)
      }}
    >
      {value}
    </button>
  )
}
