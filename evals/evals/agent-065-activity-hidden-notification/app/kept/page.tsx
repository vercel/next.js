'use client'
import Link from 'next/link'
import { useLayoutEffect, useState } from 'react'
import { INITIAL_MESSAGE, registerMessageSetter } from '../kept-page-state'
export default function Kept() {
  const [message, setMessage] = useState(INITIAL_MESSAGE)
  const [count, setCount] = useState(0)
  useLayoutEffect(() => {
    registerMessageSetter(setMessage)
    return () => setMessage(INITIAL_MESSAGE)
  }, [])
  return (
    <>
      <h1 id="kept-heading">Notifications</h1>
      <p id="message">{message}</p>
      <p id="count">{count}</p>
      <button id="increment" onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
      <button id="set-visible" onClick={() => setMessage('old notification')}>
        Show notification
      </button>
      <Link id="to-other" href="/other">
        Leave
      </Link>
    </>
  )
}
