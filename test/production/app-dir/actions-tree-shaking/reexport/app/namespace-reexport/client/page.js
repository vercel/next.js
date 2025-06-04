'use client'

import { useState } from 'react'
import * as actionMod from './actions'

export default function Page() {
  const [text, setText] = useState('initial')
  return (
    <div>
      <button
        id="action-1"
        onClick={async () => {
          setText(await actionMod.sharedClientLayerAction())
        }}
      >
        Action 1
      </button>
      <span>{text}</span>
    </div>
  )
}
