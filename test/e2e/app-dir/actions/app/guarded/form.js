'use client'

import { useState } from 'react'

export default function GuardedForm({ greet }) {
  const [msg, setMsg] = useState('')

  return (
    <div>
      <div id="guarded-result">{msg}</div>
      <button
        id="guarded-btn"
        onClick={async () => {
          const res = await greet()
          setMsg(res)
        }}
      >
        Greet
      </button>
    </div>
  )
}
