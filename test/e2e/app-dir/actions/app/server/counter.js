'use client'

import { useState } from 'react'

async function send(id, args) {
  const res = await fetch('', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Action: id,
    },
    body: JSON.stringify({
      bound: args,
    }),
  })
  return await res.json()
}

export default function Counter({ inc, dec }) {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p>Count: {count}</p>
      <button
        onClick={async () => {
          const newCount = await send(inc, [count])
          setCount(newCount)
        }}
      >
        +1
      </button>
      <button
        onClick={async () => {
          const newCount = await send(dec, [count])
          setCount(newCount)
        }}
      >
        -1
      </button>
    </div>
  )
}
