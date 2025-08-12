'use client'

import { useState } from 'react'
import { increment } from '../actions'

export default function Home() {
  const [count, setCount] = useState(0)

  return (
    <div>
      {count}
      <button
        onClick={async () => {
          const actionResult = await increment(count)
          // @ts-ignore
          setCount(actionResult)
          console.log(actionResult)
        }}
      >
        Trigger
      </button>
      Static
    </div>
  )
}
