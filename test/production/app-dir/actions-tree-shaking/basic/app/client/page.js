'use client'

import { useState } from 'react'
import { clientComponentAction } from '../actions'

export default function Page() {
  const [text, setText] = useState('initial')
  return (
    <div>
      <button
        id="action-1"
        onClick={async () => {
          setText(await clientComponentAction())
        }}
      >
        Action 1
      </button>
      <span>{text}</span>
    </div>
  )
}
