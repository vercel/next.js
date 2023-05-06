'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

export default ({ lang }) => {
  const router = useRouter()
  const [count, setCount] = useState(0)

  return (
    <>
      <div id="count">{count}</div>
      <button id="increment" onClick={() => setCount(count + 1)}>
        increment
      </button>
      <button id="push" onClick={() => router.push(lang + '-x')}>
        push to another lang
      </button>
    </>
  )
}
