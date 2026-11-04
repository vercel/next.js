'use client'

import Link from 'next/link'
import { useLayoutEffect, useState } from 'react'

export function ContactForm() {
  const [message, setMessage] = useState('')
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState<'idle' | 'success'>('idle')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('success')
  }

  useLayoutEffect(() => {
    return () => {
      setMessage('')
      setStatus('idle')
    }
  }, [])

  return (
    <form onSubmit={handleSubmit}>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
      <p data-testid="count">{count}</p>
      <label>
        Message
        <textarea
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <button type="submit">Send</button>
      {status === 'success' && (
        <>
          <p>Message sent!</p>
          <Link href="/inbox">Done</Link>
        </>
      )}
    </form>
  )
}
