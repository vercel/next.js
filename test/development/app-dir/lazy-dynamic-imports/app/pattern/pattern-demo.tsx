'use client'

import { useState } from 'react'

export function PatternDemo() {
  const [value, setValue] = useState('idle')

  return (
    <button
      id="load-pattern"
      onClick={async () => {
        const name = location.hash === '#b' ? 'b' : 'a'
        const module = await import(`./targets/${name}`)
        setValue(module.value)
      }}
    >
      {value}
    </button>
  )
}
