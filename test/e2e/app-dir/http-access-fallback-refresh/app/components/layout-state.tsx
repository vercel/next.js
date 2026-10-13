'use client'

import { useState } from 'react'

export function LayoutState() {
  const [value, setValue] = useState('')

  return (
    <label>
      Layout state
      <input
        id="layout-state"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  )
}
