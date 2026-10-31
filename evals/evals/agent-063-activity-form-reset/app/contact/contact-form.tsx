'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'

export function ContactForm() {
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const shouldReset = useRef(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('success')
    shouldReset.current = true
  }

  useLayoutEffect(() => {
    return () => {
      if (shouldReset.current) {
        shouldReset.current = false
        setMessage('')
        setStatus('idle')
      }
    }
  }, [])

  return (
    <form onSubmit={handleSubmit}>
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
