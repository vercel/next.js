'use client'
import { useState } from 'react'
export default function Toggle({ defaultOn, label }) {
  const [on, setOn] = useState(Boolean(defaultOn))
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={'toggle' + (on ? ' toggle-on' : '')}
      onClick={() => setOn(!on)}
    >
      <span className="toggle-thumb" />
    </button>
  )
}
