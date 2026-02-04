'use client'

import { useState } from 'react'
import { sharedClientLayerAction } from '../actions'

export default function Page() {
  const [text, setText] = useState('initial')
  return (
    <div>
      <h1>Two</h1>
      <button
        id="action-1"
        onClick={async () => {
          setText(await sharedClientLayerAction())
        }}
      >
        Action 1
      </button>
      <span>{text}</span>
    </div>
  )
}
