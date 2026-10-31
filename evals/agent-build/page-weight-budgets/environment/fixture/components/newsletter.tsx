'use client'

import { useState } from 'react'

export function Newsletter() {
  const [done, setDone] = useState(false)
  if (done) return <p role="status">Thanks for subscribing!</p>
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setDone(true)
      }}
    >
      <label>
        Email <input type="email" name="email" required />
      </label>{' '}
      <button type="submit">Subscribe</button>
    </form>
  )
}
