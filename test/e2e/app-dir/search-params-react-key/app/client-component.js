'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

export default () => {
  const router = useRouter()
  const [count, setCount] = useState(0)

  return (
    <>
      <div id="count">{count}</div>
      <button id="increment" onClick={() => setCount(count + 1)}>
        increment
      </button>
      <button id="push" onClick={() => router.push('/?foo=bar')}>
        push to /?foo=bar
      </button>
      <button id="replace" onClick={() => router.replace('/?foo=baz')}>
        replace with /?foo=baz
      </button>
    </>
  )
}
