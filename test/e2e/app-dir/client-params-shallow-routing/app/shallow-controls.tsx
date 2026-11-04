'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

export function ShallowControls() {
  const [value, setValue] = useState('')
  const searchParams = useSearchParams()
  return (
    <>
      {/* Lets the test wait until the router has rendered the new URL. */}
      <p id="rendered-q">{searchParams.get('q') ?? '(none)'}</p>
      <input
        id="input"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          window.history.replaceState(null, '', `?q=${event.target.value}`)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            window.history.pushState(null, '', '?q=pushed')
          }
        }}
      />
    </>
  )
}
