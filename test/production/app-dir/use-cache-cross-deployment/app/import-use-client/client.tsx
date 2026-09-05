'use client'

import { useState } from 'react'

export function Client({ children }: { children: React.ReactNode }) {
  const [text, setText] = useState('')

  return (
    <div>
      <div id="title">Client Component A</div>
      <button
        onClick={() => {
          setText('Button clicked')
        }}
      >
        Click me
      </button>
      <span id="state">{text}</span>
      <div id="data">{children}</div>
    </div>
  )
}
