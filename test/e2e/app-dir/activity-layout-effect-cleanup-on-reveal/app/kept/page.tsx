'use client'

import Link from 'next/link'
import { useLayoutEffect, useState } from 'react'
import { INITIAL_MESSAGE, registerMessageSetter } from '../kept-page-state'

export default function KeptPage() {
  const [message, setMessage] = useState(INITIAL_MESSAGE)
  const [count, setCount] = useState(0)

  // The reset pattern from the "Preserving UI state" guide: transient state is
  // reset in a `useLayoutEffect` cleanup so it does not survive while Activity
  // keeps this page hidden.
  useLayoutEffect(() => {
    registerMessageSetter(setMessage)
    console.log('kept-effect:setup')
    return () => {
      console.log('kept-effect:cleanup')
      setMessage(INITIAL_MESSAGE)
    }
  }, [])

  return (
    <>
      <h1 id="kept-heading">kept</h1>
      <p id="message">{message}</p>
      <p id="count">{count}</p>
      <button id="increment" onClick={() => setCount((value) => value + 1)}>
        increment
      </button>
      <Link id="to-other" href="/other">
        to other
      </Link>
    </>
  )
}
